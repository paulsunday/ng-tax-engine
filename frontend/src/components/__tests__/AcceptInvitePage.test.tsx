import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import AcceptInvitePage from "../../app/accept-invite/page";
import { api, ApiError } from "../../lib/api";

jest.mock("../../lib/api", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: { post: jest.fn() }, ApiError: MockApiError };
});

const push = jest.fn();
jest.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

const mockedApi = api as jest.Mocked<typeof api>;

const inspectionResult = {
  organizationName: "Acme Ltd",
  invitedByName: "Jane Owner",
  roleName: "ACCOUNTANT",
  maskedEmail: "ne**@example.com",
  requiresPassword: false,
};

describe("AcceptInvitePage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    window.location.hash = "";
  });

  test("reads the token from the URL fragment and strips it from the address bar", async () => {
    window.location.hash = "#token=abc123";
    mockedApi.post.mockResolvedValueOnce({ ...inspectionResult });

    render(<AcceptInvitePage />);

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith("/auth/invitations/inspect", { token: "abc123" }));
    expect(window.location.hash).toBe("");
  });

  test("shows an error state immediately when there is no token at all, without calling the API", () => {
    render(<AcceptInvitePage />);

    expect(screen.getByText(/missing its token/i)).toBeInTheDocument();
    expect(mockedApi.post).not.toHaveBeenCalled();
  });

  test("shows the same generic error for an invalid, expired, or revoked token", async () => {
    window.location.hash = "#token=bad";
    mockedApi.post.mockRejectedValueOnce(new ApiError(400, "This invitation link is invalid, expired, or has already been used."));

    render(<AcceptInvitePage />);

    expect(await screen.findByText(/invalid, expired, or has already been used/)).toBeInTheDocument();
  });

  test("a brand-new invitee is asked for a full name and password before accepting", async () => {
    window.location.hash = "#token=abc";
    mockedApi.post.mockResolvedValueOnce({ ...inspectionResult, requiresPassword: true });

    render(<AcceptInvitePage />);

    expect(await screen.findByLabelText("Full name")).toBeInTheDocument();
    expect(screen.getByLabelText("Set a password")).toBeInTheDocument();
  });

  test("an existing account never sees password fields and accepts with just the token", async () => {
    window.location.hash = "#token=abc";
    mockedApi.post.mockResolvedValueOnce({ ...inspectionResult, requiresPassword: false }).mockResolvedValueOnce({ accessToken: "irrelevant" });

    render(<AcceptInvitePage />);
    await screen.findByText(/You've been invited to join/);
    expect(screen.queryByLabelText("Set a password")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Accept invitation" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith("/auth/invitations/accept", { token: "abc", fullName: undefined, password: undefined })
    );
    expect(push).toHaveBeenCalledWith("/login?accepted=1");
  });
});
