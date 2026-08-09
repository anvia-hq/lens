---
layout: ../../../layouts/DocsLayout.astro
title: Authentication
description: Bootstrap the owner, sign in, accept invitations, and understand account recovery.
eyebrow: Management
---

Lens uses email-and-password accounts scoped to one workspace organization. Public account creation
is available only during initial bootstrap.

## Create the owner

On an uninitialized installation, the root URL displays **Workspace setup**. Enter a name, email,
password, and matching password confirmation. Passwords must contain at least eight characters.

The account becomes the organization owner. Bootstrap is rate-limited and closes as soon as an
organization has been created, preventing later visitors from creating another owner.

The owner role cannot be changed or removed through the product.

## Sign in and out

After bootstrap, the root URL displays the normal sign-in form. Enter the account email and
password. Use the action beside the user card in either workspace or project navigation to sign out.

Authentication sessions are browser-based. If an authenticated account loses workspace
membership, project and workspace API requests are rejected.

## Join through an invitation

An owner or admin creates a private invitation link for an email address and role. Open the exact
link, enter a name and password, and select **Create account and join**.

Invitations expire after seven days and can be used only while pending. A cancelled, expired,
accepted, or unknown invitation displays as unavailable. The invited email address is fixed by the
invitation and cannot be changed while claiming it.

## Password reset email

Lens can send password-reset mail when SMTP is configured. Leave SMTP credentials empty to disable
mail delivery. The current sign-in screen does not expose a self-service reset control, so operators
should not promise that workflow until the corresponding UI is available.

Configure SMTP through the [environment reference](/docs/operations/configuration/#email).

## Secure the public origin

Use HTTPS for any non-local installation and set `PUBLIC_APP_URL` and `WEB_ORIGIN` to the same public
origin. Keep `BETTER_AUTH_SECRET` private, unique to the installation, and at least 32 characters.
