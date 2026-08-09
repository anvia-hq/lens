---
layout: ../../../layouts/DocsLayout.astro
title: Members and roles
description: Invite teammates and manage organization-wide access to Lens projects.
eyebrow: Management
---

Workspace membership grants access to the organization's projects. Lens currently uses three
roles: owner, admin, and member.

## Role capabilities

| Capability | Owner | Admin | Member |
| --- | --- | --- | --- |
| View projects and telemetry | Yes | Yes | Yes |
| Create projects | Yes | Yes | No |
| Invite, update, or remove members | Yes | Yes | No |
| Manage project keys and retention | Yes | Yes | No |
| Manage datasets and quality gates | Yes | Yes | No |
| Change or remove the owner | No | No | No |

The owner is the account created during bootstrap. Admins have operational management access but do
not replace the protected owner.

## Invite a member

Open **Members**, select **Add member**, enter the email address, and choose Admin or Member. Lens
creates a private invitation link; it does not require email delivery.

Copy the link and send it through a trusted channel. The invitation expires after seven days. The
pending invitation list shows role and expiration and allows an owner or admin to copy or cancel the
link.

## Change a role

Use the role selector in the member table to switch a non-owner account between Member and Admin.
The update affects access across every project in the organization.

Review admin assignments carefully because admins can create and delete projects, rotate ingestion
keys, change retention, manage datasets and gates, and manage other non-owner members.

## Remove a member

Select the remove action beside a non-owner account and confirm. The account immediately loses
access to every project in the organization. The current user cannot remove themselves from this
screen, and the owner cannot be removed.
