import { Logger } from "@nestjs/common";
import { EventEmitter } from "events";
import { RequestLoggingMiddleware } from "../../../src/api/common/middleware/request-logging.middleware";

function makeRes(statusCode: number) {
  const res = new EventEmitter() as any;
  res.statusCode = statusCode;
  return res;
}

describe("RequestLoggingMiddleware (mandate §16 — baseline operational visibility)", () => {
  test("logs a 5xx response at error level", () => {
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const middleware = new RequestLoggingMiddleware();
    const req: any = { method: "POST", originalUrl: "/companies/x/tax-returns" };
    const res = makeRes(500);
    const next = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalled();
    res.emit("finish");

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("POST /companies/x/tax-returns 500"));
    errorSpy.mockRestore();
  });

  test("logs a 4xx response at warn level, not error", () => {
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const middleware = new RequestLoggingMiddleware();
    const req: any = { method: "GET", originalUrl: "/companies/x" };
    const res = makeRes(404);

    middleware.use(req, res, jest.fn());
    res.emit("finish");

    expect(warnSpy).toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test("logs a successful response at normal (log) level, not warn or error", () => {
    const logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    const errorSpy = jest.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const middleware = new RequestLoggingMiddleware();
    const req: any = { method: "GET", originalUrl: "/health" };
    const res = makeRes(200);

    middleware.use(req, res, jest.fn());
    res.emit("finish");

    expect(logSpy).toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });
});
