// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthFormState } from "../hooks/use-auth-form";
import { AuthForm } from "./auth-form";

afterEach(cleanup);

function state(overrides: Partial<AuthFormState> = {}): AuthFormState {
  return {
    email: "",
    error: "",
    isOidcSubmitting: false,
    isSubmitting: false,
    mode: "login",
    name: "",
    password: "",
    passwordConfirmation: "",
    setEmail: vi.fn(),
    setName: vi.fn(),
    setPassword: vi.fn(),
    setPasswordConfirmation: vi.fn(),
    setup: {
      data: {
        initialized: true,
        passwordLoginEnabled: true,
        oidc: { providerId: "oidc", displayName: "Acme SSO" },
      },
    } as AuthFormState["setup"],
    signInWithOidc: vi.fn(),
    submit: vi.fn(),
    ...overrides,
  };
}

describe("AuthForm OIDC login", () => {
  it("starts the configured OIDC login", () => {
    const value = state();
    render(<AuthForm state={value} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Acme SSO" }));
    expect(value.signInWithOidc).toHaveBeenCalledOnce();
    expect(screen.getByLabelText("Email")).toBeTruthy();
  });

  it("can present OIDC as the only login method", () => {
    render(
      <AuthForm
        state={state({
          setup: {
            data: {
              initialized: true,
              passwordLoginEnabled: false,
              oidc: { providerId: "oidc", displayName: "Acme SSO" },
            },
          } as AuthFormState["setup"],
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue with Acme SSO" })).toBeTruthy();
    expect(screen.queryByLabelText("Email")).toBeNull();
  });
});
