// @vitest-environment happy-dom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { InvitationState } from "../hooks/use-invitation";
import type { SetupStatus } from "../types";
import { InvitationCard } from "./invitation-card";

afterEach(cleanup);

function state(setup: SetupStatus): InvitationState {
  return {
    actionable: true,
    claim: { error: null, isPending: false } as InvitationState["claim"],
    detail: {
      id: "invitation-1",
      email: "person@example.com",
      role: "member",
      status: "pending",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    error: undefined,
    expired: false,
    invitation: {} as InvitationState["invitation"],
    isOidcSubmitting: false,
    name: "",
    password: "",
    passwordConfirmation: "",
    setName: vi.fn(),
    setPassword: vi.fn(),
    setPasswordConfirmation: vi.fn(),
    setup: { data: setup, isSuccess: true } as InvitationState["setup"],
    signInWithOidc: vi.fn(),
    submit: vi.fn(),
    validationError: "",
  };
}

describe("InvitationCard authentication methods", () => {
  it("uses OIDC without collecting credentials in OIDC-only mode", () => {
    const value = state({
      initialized: true,
      passwordLoginEnabled: false,
      oidc: { providerId: "oidc", displayName: "Acme SSO" },
    });
    render(<InvitationCard state={value} />);

    fireEvent.click(screen.getByRole("button", { name: "Continue with Acme SSO" }));

    expect(value.signInWithOidc).toHaveBeenCalledOnce();
    expect(screen.queryByLabelText("Password")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("keeps credential claiming as a fallback when password login is enabled", () => {
    render(
      <InvitationCard
        state={state({
          initialized: true,
          passwordLoginEnabled: true,
          oidc: { providerId: "oidc", displayName: "Acme SSO" },
        })}
      />,
    );

    expect(screen.getByRole("button", { name: "Continue with Acme SSO" })).toBeTruthy();
    expect(screen.getByLabelText("Password")).toBeTruthy();
    expect(screen.getByLabelText("Name")).toBeTruthy();
  });
});
