"use client";

import Link from "next/link";
import {
  FormEvent,
  useEffect,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

import {
  CasaConfirmDialog,
} from "@/components/casa-confirm-dialog";

type Branch = {
  id: string;
  name: string;
  code: string;
  is_headquarters: boolean;
  status: string;
  address: string | null;
  student_count?: number;
  enrolled_count?: number;
  membership_id?: string | null;
  administrator_name?: string | null;
  administrator_email?: string | null;
  membership_status?: string | null;
  has_password?: boolean | null;
};

type PendingCard = {
  card_id: string;
  student_id: string;
  student_name: string;
  casa_student_id: string;
  serial_number: string;
};

type SetupLink = {
  url: string;
  expiresAt: string;
};

type ConfirmAction = {
  next: "ACTIVE" | "SUSPENDED";
  title: string;
  message: string;
  confirmLabel: string;
  danger: boolean;
};

export default function SchoolDetailClient({
  school,
  branches,
  owners,
  pendingCards,
  metrics,
  canManageStructure,
  isSuperAdmin,
}: {
  school: {
    id: string;
    name: string;
    slug: string;
    timezone: string;
    status: string;
  };
  branches: Branch[];
  owners: Array<{
    full_name: string;
    email: string | null;
    phone: string | null;
  }>;
  pendingCards: PendingCard[];
  metrics: {
    students: number;
    ready_cards: number;
    active_cards: number;
  };
  canManageStructure: boolean;
  isSuperAdmin: boolean;
}) {
  const router =
    useRouter();

  const [
    directory,
    setDirectory,
  ] = useState<Branch[]>(
    branches,
  );
  const [
    adding,
    setAdding,
  ] = useState(false);
  const [
    busy,
    setBusy,
  ] = useState(false);
  const [
    error,
    setError,
  ] = useState("");
  const [
    notice,
    setNotice,
  ] = useState("");
  const [
    recovery,
    setRecovery,
  ] = useState<SetupLink | null>(
    null,
  );
  const [
    branchSetup,
    setBranchSetup,
  ] = useState<SetupLink | null>(
    null,
  );
  const [
    name,
    setName,
  ] = useState("");
  const [
    code,
    setCode,
  ] = useState("");
  const [
    address,
    setAddress,
  ] = useState("");
  const [
    adminBranchId,
    setAdminBranchId,
  ] = useState("");
  const [
    adminName,
    setAdminName,
  ] = useState("");
  const [
    adminEmail,
    setAdminEmail,
  ] = useState("");
  const [
    confirmAction,
    setConfirmAction,
  ] = useState<ConfirmAction | null>(
    null,
  );

  useEffect(() => {
    let cancelled =
      false;

    void fetch(
      `/api/internal/platform/schools/${encodeURIComponent(
        school.id,
      )}/branches`,
      {
        cache:
          "no-store",
        credentials:
          "same-origin",
      },
    )
      .then(
        async (
          response,
        ) => {
          const body =
            await response
              .json()
              .catch(
                () =>
                  null,
              ) as {
                branches?:
                  Branch[];
                message?:
                  string;
              } | null;

          if (!response.ok) {
            throw new Error(
              body?.message ??
                "Unable to load the branch directory.",
            );
          }

          return body;
        },
      )
      .then(
        (
          body,
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          setDirectory(
            body?.branches ??
              branches,
          );
        },
      )
      .catch(() => {
        // Initial server-rendered directory remains usable if refresh fails.
      });

    return () => {
      cancelled =
        true;
    };
  }, [
    branches,
    school.id,
  ]);

  async function reloadDirectory() {
    const response =
      await fetch(
        `/api/internal/platform/schools/${encodeURIComponent(
          school.id,
        )}/branches`,
        {
          cache:
            "no-store",
          credentials:
            "same-origin",
        },
      );

    const body =
      await response
        .json()
        .catch(
          () => null,
        ) as {
          branches?:
            Branch[];
          message?:
            string;
        } | null;

    if (!response.ok) {
      throw new Error(
        body?.message ??
          "Unable to refresh the branch directory.",
      );
    }

    setDirectory(
      body?.branches ??
        [],
    );
  }

  async function add(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    setBranchSetup(null);

    try {
      const response =
        await fetch(
          `/api/internal/platform/schools/${encodeURIComponent(
            school.id,
          )}/branches`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                name,
                code,
                address:
                  address.trim() ||
                  null,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => null,
          ) as {
            id?: string;
            message?: string;
          } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ??
            "Branch creation failed.",
        );
      }

      setAdding(false);
      setName("");
      setCode("");
      setAddress("");

      if (body?.id) {
        setAdminBranchId(
          body.id,
        );
        setNotice(
          "Branch created. Set up its first Branch Admin to complete campus provisioning.",
        );
      }

      await reloadDirectory();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Branch creation failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function provisionBranchAdmin(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !adminBranchId
    ) {
      setError(
        "Select a branch before setting up its Branch Admin.",
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");
    setBranchSetup(null);

    try {
      const response =
        await fetch(
          `/api/internal/platform/schools/${encodeURIComponent(
            school.id,
          )}/branches`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                action:
                  "PROVISION_ADMIN",
                branchId:
                  adminBranchId,
                fullName:
                  adminName,
                email:
                  adminEmail,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => null,
          ) as {
          administrator?: {
            fullName?: string;
            email?: string | null;
            existingIdentity?: boolean;
            setup?: SetupLink | null;
          };
          emailDelivery?: string;
          message?: string;
        } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ??
            "Branch Admin setup failed.",
        );
      }

      setBranchSetup(
        body?.administrator
          ?.setup ??
          null,
      );
      setAdminName("");
      setAdminEmail("");
      setAdminBranchId("");

      setNotice(
        body?.administrator?.setup
          ? body?.emailDelivery === "SENT"
            ? "Branch Admin assigned. CASA emailed the private setup link. The visible link below is the fallback."
            : "Branch Admin assigned. Email delivery did not complete; use the private fallback link below."
          : body?.emailDelivery === "SENT"
            ? "Branch Admin assigned. CASA emailed the sign-in link."
            : "Branch Admin assigned. Existing CASA credentials can be used; automatic email delivery did not complete.",
      );

      await reloadDirectory();
      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Branch Admin setup failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function reissueBranchAdminSetup(
    branchId: string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");
    setBranchSetup(null);

    try {
      const response =
        await fetch(
          `/api/internal/platform/schools/${encodeURIComponent(
            school.id,
          )}/branches`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            credentials:
              "same-origin",
            body:
              JSON.stringify({
                action:
                  "REISSUE_ADMIN_SETUP",
                branchId,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => null,
          ) as {
          administrator?: {
            setup?: SetupLink | null;
          };
          emailDelivery?: string;
          message?: string;
        } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ??
            "A new Branch Admin setup link could not be created.",
        );
      }

      setBranchSetup(
        body?.administrator
          ?.setup ??
          null,
      );
      setNotice(
        body?.emailDelivery === "SENT"
          ? "A new Branch Admin setup link was created and emailed. The older unused setup link is no longer valid."
          : "A new Branch Admin setup link was created, but email delivery did not complete. Use the visible fallback link. The older unused setup link is no longer valid.",
      );
      await reloadDirectory();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "A new Branch Admin setup link could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function applyStatus(
    next:
      | "ACTIVE"
      | "SUSPENDED",
  ) {
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/internal/platform/schools/${school.id}/status`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                status:
                  next,
                confirm:
                  true,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          );

      if (!response.ok) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Organization update failed.",
        );
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Organization update failed.",
      );
    } finally {
      setBusy(false);
      setConfirmAction(null);
    }
  }

  async function ownerRecovery() {
    setBusy(true);
    setError("");
    setRecovery(null);

    try {
      const response =
        await fetch(
          `/api/internal/platform/schools/${encodeURIComponent(
            school.id,
          )}/owner-recovery`,
          {
            method:
              "POST",
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => ({}),
          );

      if (!response.ok) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Owner recovery link could not be created.",
        );
      }

      setRecovery(
        body.setup ??
          null,
      );
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Owner recovery link could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  function askStatus(
    next:
      | "ACTIVE"
      | "SUSPENDED",
  ) {
    const suspending =
      next ===
      "SUSPENDED";

    setConfirmAction({
      next,
      title:
        suspending
          ? "Deactivate organization?"
          : "Reactivate organization?",
      message:
        suspending
          ? `Deactivate ${school.name}? Linked branches and operational access will be unavailable until the organization is reactivated.`
          : `Reactivate ${school.name} and restore the branches that were active before suspension?`,
      confirmLabel:
        suspending
          ? "Deactivate"
          : "Reactivate",
      danger:
        suspending,
    });
  }

  const selectedAdminBranch =
    directory.find(
      (
        branch,
      ) =>
        branch.id ===
        adminBranchId,
    ) ??
    null;

  return (
    <div className="px-5 py-6 sm:px-8 lg:px-10">
      <section className="grid gap-4 md:grid-cols-4">
        {[
          [
            "Students",
            metrics.students,
          ],
          [
            "Campuses",
            directory.length,
          ],
          [
            "Cards awaiting school handover",
            metrics.ready_cards,
          ],
          [
            "Active cards",
            metrics.active_cards,
          ],
        ].map(
          ([
            label,
            value,
          ]) => (
            <div
              className="border border-black bg-white p-4"
              key={
                String(
                  label,
                )
              }
            >
              <p className="casa-kicker text-black/40">
                {label}
              </p>
              <p className="mt-3 text-3xl font-semibold">
                {value}
              </p>
            </div>
          ),
        )}
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-[1.25fr_.75fr]">
        <div className="border border-black bg-white p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="casa-kicker text-black/40">
                Organization
              </p>
              <h2 className="mt-3 text-3xl font-semibold">
                {school.name}
              </h2>
              <p className="mt-2 font-mono text-[10px] uppercase">
                {school.status}
              </p>
            </div>

            {isSuperAdmin ? (
              <button
                className={
                  school.status ===
                  "ACTIVE"
                    ? "border border-[#a12620] px-4 py-3 text-sm text-[#7e1d18]"
                    : "casa-button-primary"
                }
                disabled={busy}
                onClick={() =>
                  askStatus(
                    school.status ===
                      "ACTIVE"
                      ? "SUSPENDED"
                      : "ACTIVE",
                  )
                }
                type="button"
              >
                {school.status ===
                "ACTIVE"
                  ? "Deactivate organization"
                  : "Reactivate organization"}
              </button>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 border-t border-black/15 pt-5 sm:grid-cols-2">
            <div>
              <p className="casa-kicker text-black/35">
                Workspace
              </p>
              <p className="mt-2 font-mono text-sm">
                {school.slug}
              </p>
            </div>
            <div>
              <p className="casa-kicker text-black/35">
                Timezone
              </p>
              <p className="mt-2 text-sm">
                {school.timezone}
              </p>
            </div>
          </div>

          <div className="mt-7 flex flex-wrap gap-3">
            <Link
              className="casa-button-primary"
              href={`/internal/onboarding?school=${school.id}`}
            >
              Open student onboarding
            </Link>
            <Link
              className="casa-button"
              href={`/login?school=${school.slug}`}
            >
              School sign-in
            </Link>
          </div>
        </div>

        <div className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            School leadership
          </p>
          <h3 className="mt-3 text-xl font-semibold">
            Owner
          </h3>

          {isSuperAdmin ? (
            <button
              className="casa-button mt-4"
              disabled={busy}
              onClick={() =>
                void ownerRecovery()
              }
              type="button"
            >
              Create owner recovery link
            </button>
          ) : null}

          {recovery ? (
            <div className="mt-4 border border-black bg-[#e8f2ec] p-3">
              <p className="font-mono text-[9px] font-bold uppercase">
                One-time owner setup / recovery
              </p>
              <p className="mt-2 break-all font-mono text-[10px]">
                {recovery.url}
              </p>
              <p className="mt-2 text-xs text-black/45">
                Expires after 24 hours and becomes unusable after the password is set.
              </p>
            </div>
          ) : null}

          {owners.map(
            (
              owner,
            ) => (
              <div
                className="mt-4 border-t border-black/15 pt-4"
                key={
                  owner.email ??
                  owner.full_name
                }
              >
                <p className="font-semibold">
                  {owner.full_name}
                </p>
                <p className="mt-1 text-sm text-black/50">
                  {owner.email ??
                    owner.phone}
                </p>
              </div>
            ),
          )}
        </div>
      </section>

      {error ? (
        <div className="mt-5 border-l-2 border-[#a12620] bg-[#f6e8e6] p-3 text-sm text-[#7e1d18]">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="casa-notice mt-5">
          {notice}
        </div>
      ) : null}

      {branchSetup ? (
        <div className="mt-5 border border-black bg-[#e8f2ec] p-4">
          <p className="casa-kicker">
            One-time Branch Admin setup
          </p>
          <p className="mt-2 break-all font-mono text-[10px]">
            {branchSetup.url}
          </p>
          <p className="mt-2 text-xs text-black/50">
            Share privately. It expires after 24 hours and becomes unusable after the password is set.
          </p>
        </div>
      ) : null}

      {isSuperAdmin ? (
        <section className="mt-7 border border-black bg-white">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">
              Cards awaiting school handover
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {pendingCards.length} pending handover
            </h2>
          </div>

          {pendingCards.length ===
          0 ? (
            <p className="p-5 text-sm text-black/50">
              No cards are waiting for school handover.
            </p>
          ) : (
            pendingCards.map(
              (
                card,
              ) => (
                <div
                  className="grid gap-3 border-b border-black/15 p-5 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center"
                  key={card.card_id}
                >
                  <div>
                    <p className="font-semibold">
                      {card.student_name}
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase text-black/40">
                      {card.casa_student_id} · {card.serial_number}
                    </p>
                  </div>
                  <span className="font-mono text-[9px] uppercase text-black/45">
                    Ready for school handover
                  </span>
                  <span className="border border-black/20 px-3 py-2 text-xs font-semibold">
                    School/Branch Admin action
                  </span>
                </div>
              ),
            )
          )}
        </section>
      ) : null}

      <section className="mt-7 border border-black bg-white">
        <div className="flex items-center justify-between border-b border-black p-5">
          <div>
            <p className="casa-kicker text-black/40">
              Organization campus directory
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {directory.length} locations
            </h2>
            <p className="mt-2 text-sm text-black/50">
              Platform Control can see the complete organization. School and branch operational authority remains campus-scoped.
            </p>
          </div>

          {canManageStructure &&
          school.status ===
            "ACTIVE" ? (
            <button
              className="casa-button-primary"
              onClick={() =>
                setAdding(
                  (
                    value,
                  ) =>
                    !value,
                )
              }
              type="button"
            >
              Add branch
            </button>
          ) : null}
        </div>

        {adding ? (
          <form
            className="grid gap-4 border-b border-black bg-[#f2f2ef] p-5 sm:grid-cols-2"
            onSubmit={add}
          >
            <label className="casa-label">
              <span>Name</span>
              <input
                className="casa-field bg-white"
                onChange={
                  (
                    event,
                  ) =>
                    setName(
                      event.target.value,
                    )
                }
                required
                value={name}
              />
            </label>

            <label className="casa-label">
              <span>Code</span>
              <input
                className="casa-field bg-white"
                onChange={
                  (
                    event,
                  ) =>
                    setCode(
                      event.target.value.toUpperCase(),
                    )
                }
                required
                value={code}
              />
            </label>

            <label className="casa-label sm:col-span-2">
              <span>Address</span>
              <textarea
                className="casa-field bg-white"
                onChange={
                  (
                    event,
                  ) =>
                    setAddress(
                      event.target.value,
                    )
                }
                value={address}
              />
            </label>

            <button
              className="casa-button-primary sm:col-span-2"
              disabled={busy}
            >
              Create branch
            </button>
          </form>
        ) : null}

        {adminBranchId ? (
          <form
            className="grid gap-4 border-b border-black bg-[#f2f2ef] p-5 sm:grid-cols-2"
            onSubmit={
              provisionBranchAdmin
            }
          >
            <div className="sm:col-span-2">
              <p className="casa-kicker text-black/40">
                Set up Branch Admin
              </p>
              <p className="mt-2 text-sm">
                {selectedAdminBranch?.name ??
                  "Selected branch"}
              </p>
            </div>

            <label className="casa-label">
              <span>Full name</span>
              <input
                className="casa-field bg-white"
                onChange={
                  (
                    event,
                  ) =>
                    setAdminName(
                      event.target.value,
                    )
                }
                required
                value={adminName}
              />
            </label>

            <label className="casa-label">
              <span>Email</span>
              <input
                className="casa-field bg-white"
                onChange={
                  (
                    event,
                  ) =>
                    setAdminEmail(
                      event.target.value,
                    )
                }
                required
                type="email"
                value={adminEmail}
              />
            </label>

            <div className="flex gap-2 sm:col-span-2">
              <button
                className="casa-button-primary"
                disabled={busy}
              >
                Provision Branch Admin
              </button>
              <button
                className="casa-button"
                disabled={busy}
                onClick={() => {
                  setAdminBranchId("");
                  setAdminName("");
                  setAdminEmail("");
                }}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {directory.map(
          (
            branch,
          ) => {
            const hasAdmin =
              Boolean(
                branch.membership_id,
              );
            const adminActive =
              hasAdmin &&
              Boolean(
                branch.has_password,
              );

            return (
              <div
                className="grid gap-4 border-b border-black/15 p-5 last:border-b-0 lg:grid-cols-[1.15fr_.9fr_auto] lg:items-center"
                key={branch.id}
              >
                <div>
                  <p className="font-semibold">
                    {branch.name}
                    {branch.is_headquarters
                      ? " · HQ"
                      : ""}
                  </p>
                  <p className="mt-1 font-mono text-[9px] uppercase text-black/40">
                    {branch.code} · {branch.status}
                  </p>
                  <p className="mt-2 text-sm text-black/50">
                    {branch.address ??
                      "No address"}
                  </p>
                </div>

                <div>
                  <p className="casa-kicker text-black/35">
                    Branch administration
                  </p>

                  {branch.is_headquarters ? (
                    <p className="mt-2 text-sm">
                      Headquarters
                    </p>
                  ) : adminActive ? (
                    <>
                      <p className="mt-2 text-sm font-semibold">
                        Branch Admin active
                      </p>
                      <p className="mt-1 text-xs text-black/50">
                        {branch.administrator_name ??
                          branch.administrator_email ??
                          "Assigned administrator"}
                      </p>
                    </>
                  ) : hasAdmin ? (
                    <>
                      <p className="mt-2 text-sm font-semibold">
                        Awaiting Branch Admin setup
                      </p>
                      <p className="mt-1 text-xs text-black/50">
                        {branch.administrator_name ??
                          branch.administrator_email ??
                          "Assigned administrator"}
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm font-semibold">
                      No Branch Admin yet
                    </p>
                  )}
                </div>

                {!branch.is_headquarters &&
                canManageStructure ? (
                  <div className="flex flex-wrap gap-2 lg:justify-end">
                    {!hasAdmin ? (
                      <button
                        className="casa-button"
                        disabled={busy}
                        onClick={() => {
                          setAdminBranchId(
                            branch.id,
                          );
                          setAdminName("");
                          setAdminEmail("");
                          setBranchSetup(null);
                        }}
                        type="button"
                      >
                        Set up Branch Admin
                      </button>
                    ) : !adminActive ? (
                      <button
                        className="casa-button"
                        disabled={busy}
                        onClick={() =>
                          void reissueBranchAdminSetup(
                            branch.id,
                          )
                        }
                        type="button"
                      >
                        Create new setup link
                      </button>
                    ) : (
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/45">
                        Admin active
                      </span>
                    )}
                  </div>
                ) : null}
              </div>
            );
          },
        )}
      </section>

      <CasaConfirmDialog
        busy={busy}
        confirmLabel={
          confirmAction?.confirmLabel ??
          "Confirm"
        }
        danger={
          confirmAction?.danger ??
          false
        }
        message={
          confirmAction?.message ??
          ""
        }
        onCancel={() =>
          setConfirmAction(
            null,
          )
        }
        onConfirm={() =>
          confirmAction
            ? void applyStatus(
                confirmAction.next,
              )
            : undefined
        }
        open={
          confirmAction !==
          null
        }
        title={
          confirmAction?.title ??
          "Confirm action"
        }
      />
    </div>
  );
}
