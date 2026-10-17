import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { TeamPage } from "../../app/settings/team/page";
import { api, ApiError } from "../../lib/api";
import { useAuth } from "../../lib/auth";

jest.mock("../../lib/api", () => {
  class MockApiError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
    }
  }
  return { api: { get: jest.fn(), post: jest.fn(), patch: jest.fn() }, ApiError: MockApiError };
});

jest.mock("../../lib/auth", () => ({ useAuth: jest.fn() }));

const mockedApi = api as jest.Mocked<typeof api>;
const mockedUseAuth = useAuth as jest.Mock;

function member(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    membershipId: "m1",
    email: "alice@example.com",
    fullName: "Alice",
    roleName: "ACCOUNTANT",
    status: "ACTIVE",
    joinedAt: "2026-01-01T00:00:00.000Z",
    invitationId: null,
    invitedAt: null,
    inviteExpiresAt: null,
    isInviteExpired: false,
    invitedByName: null,
    ...overrides,
  };
}

describe("TeamPage", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedUseAuth.mockReturnValue({ claims: { roleName: "COMPANY_OWNER" } });
  });

  test("renders the member list once loaded", async () => {
    mockedApi.get.mockResolvedValue({ members: [member()] });

    render(<TeamPage />);

    expect(await screen.findByText("Alice")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  test("shows a permission-denied message on 403 rather than crashing, and never renders the invite form", async () => {
    mockedApi.get.mockRejectedValue(new ApiError(403, "Missing required permission(s): org.users.manage"));

    render(<TeamPage />);

    expect(await screen.findByText(/only a company owner or admin/i)).toBeInTheDocument();
    expect(screen.queryByText("Invite someone")).not.toBeInTheDocument();
  });

  test("invite form submits email/fullName/roleName and shows the accept-URL fallback when email isn't configured", async () => {
    mockedApi.get.mockResolvedValue({ members: [] });
    mockedApi.post.mockResolvedValue({ acceptUrl: "https://app.test/accept-invite#token=abc", email: "new@example.com" });

    render(<TeamPage />);
    await screen.findByText("Invite someone");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "new@example.com" } });
    fireEvent.change(screen.getByLabelText("Full name"), { target: { value: "New Person" } });
    fireEvent.click(screen.getByText("Send invite"));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith("/organizations/me/invitations", {
        email: "new@example.com",
        fullName: "New Person",
        roleName: expect.any(String),
      })
    );
    expect(await screen.findByText(/Share this link only with new@example.com/)).toBeInTheDocument();
  });

  test("hides Company Owner from the role picker unless the current user already is one", async () => {
    mockedUseAuth.mockReturnValue({ claims: { roleName: "ACCOUNTANT" } });
    mockedApi.get.mockResolvedValue({ members: [] });

    render(<TeamPage />);
    await screen.findByText("Invite someone");

    const options = screen.getByLabelText("Role") as HTMLSelectElement;
    expect(Array.from(options.options).map((o) => o.value)).not.toContain("COMPANY_OWNER");
  });

  test("offers Company Owner in the role picker when the current user is one", async () => {
    mockedUseAuth.mockReturnValue({ claims: { roleName: "COMPANY_OWNER" } });
    mockedApi.get.mockResolvedValue({ members: [] });

    render(<TeamPage />);
    await screen.findByText("Invite someone");

    const options = screen.getByLabelText("Role") as HTMLSelectElement;
    expect(Array.from(options.options).map((o) => o.value)).toContain("COMPANY_OWNER");
  });

  test("disabling a member requires an explicit confirm step, not an immediate action", async () => {
    mockedApi.get.mockResolvedValue({ members: [member()] });
    mockedApi.post.mockResolvedValue({});

    render(<TeamPage />);
    await screen.findByText("Alice");

    fireEvent.click(screen.getByText("Disable"));
    expect(mockedApi.post).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Confirm disable"));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith("/organizations/me/members/m1/disable"));
  });

  test("an INVITED member offers resend and revoke, with revoke requiring confirmation", async () => {
    mockedApi.get.mockResolvedValue({
      members: [member({ status: "INVITED", joinedAt: null, invitationId: "inv-1", invitedAt: "2026-01-01T00:00:00.000Z", invitedByName: "Jane" })],
    });
    mockedApi.post.mockResolvedValue({});

    render(<TeamPage />);
    await screen.findByText("Alice");
    expect(screen.getByText("Invited")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Resend"));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith("/organizations/me/invitations/inv-1/resend"));

    fireEvent.click(screen.getByText("Revoke"));
    expect(mockedApi.post).toHaveBeenCalledTimes(1); // the revoke click alone hasn't fired the API call yet
    fireEvent.click(screen.getByText("Confirm revoke"));
    await waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith("/organizations/me/invitations/inv-1/revoke"));
  });
});
