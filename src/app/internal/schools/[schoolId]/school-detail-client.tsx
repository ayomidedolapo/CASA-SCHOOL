"use client";

import Link from "next/link";
import {
  FormEvent,
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
  student_count: number;
  enrolled_count: number;
};

type PendingCard = {
  card_id: string;
  student_id: string;
  student_name: string;
  casa_student_id: string;
  serial_number: string;
};

type ConfirmAction =
  | {
      kind: "STATUS";
      next: "ACTIVE" | "SUSPENDED";
      title: string;
      message: string;
      confirmLabel: string;
      danger: boolean;
    }
  | {
      kind: "ACTIVATE_CARD";
      card: PendingCard;
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
    recovery,
    setRecovery,
  ] = useState<{
    url: string;
    expiresAt: string;
  } | null>(null);
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
    confirmAction,
    setConfirmAction,
  ] = useState<ConfirmAction | null>(null);

  async function add(
    event: FormEvent,
  ) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/internal/platform/schools/${school.id}/branches`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
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
            () => ({}),
          );

      if (
        !response.ok
      ) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Branch creation failed.",
        );
      }

      setAdding(false);
      setName("");
      setCode("");
      setAddress("");
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

      if (
        !response.ok
      ) {
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

  async function applyCardActivation(
    card: PendingCard,
  ) {
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          `/api/internal/platform/schools/${school.id}/students/${card.student_id}/cards/${card.card_id}/activate`,
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

      if (
        !response.ok
      ) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Card activation failed.",
        );
      }

      router.refresh();
    } catch (caught) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Card activation failed.",
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

      if (
        !response.ok
      ) {
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
      kind:
        "STATUS",
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

  function askCardActivation(
    card: PendingCard,
  ) {
    setConfirmAction({
      kind:
        "ACTIVATE_CARD",
      card,
      title:
        "Activate student card?",
      message:
        `Activate ${card.student_name}'s card now? The card will immediately become scanner-usable.`,
      confirmLabel:
        "Activate card",
      danger:
        false,
    });
  }

  async function confirmPendingAction() {
    const action =
      confirmAction;

    if (
      !action
    ) {
      return;
    }

    if (
      action.kind ===
      "STATUS"
    ) {
      await applyStatus(
        action.next,
      );
      return;
    }

    await applyCardActivation(
      action.card,
    );
  }

  return (
    <div className="px-5 py-6 sm:px-8 lg:px-10">
      <section className="grid gap-4 md:grid-cols-4">
        {[
          [
            "Students",
            metrics.students,
          ],
          [
            "Branches",
            branches.length,
          ],
          [
            "Cards awaiting activation",
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
                {
                  school.name
                }
              </h2>
              <p className="mt-2 font-mono text-[10px] uppercase">
                {
                  school.status
                }
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
                disabled={
                  busy
                }
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
                {
                  school.slug
                }
              </p>
            </div>
            <div>
              <p className="casa-kicker text-black/35">
                Timezone
              </p>
              <p className="mt-2 text-sm">
                {
                  school.timezone
                }
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
              disabled={
                busy
              }
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
                One-time password recovery
              </p>
              <p className="mt-2 break-all font-mono text-[10px]">
                {
                  recovery.url
                }
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
                  {
                    owner.full_name
                  }
                </p>
                <p className="mt-1 text-sm text-black/50">
                  {
                    owner.email ??
                    owner.phone
                  }
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

      {isSuperAdmin ? (
        <section className="mt-7 border border-black bg-white">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">
              Cards awaiting activation
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {
                pendingCards.length
              } pending handover
            </h2>
          </div>

          {pendingCards.length ===
          0 ? (
            <p className="p-5 text-sm text-black/50">
              No cards are waiting for activation.
            </p>
          ) : (
            pendingCards.map(
              (
                card,
              ) => (
                <div
                  className="grid gap-3 border-b border-black/15 p-5 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center"
                  key={
                    card.card_id
                  }
                >
                  <div>
                    <p className="font-semibold">
                      {
                        card.student_name
                      }
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase text-black/40">
                      {
                        card.casa_student_id
                      } · {
                        card.serial_number
                      }
                    </p>
                  </div>
                  <span className="font-mono text-[9px] uppercase text-black/45">
                    Ready for activation
                  </span>
                  <button
                    className="casa-button-primary"
                    disabled={
                      busy
                    }
                    onClick={() =>
                      askCardActivation(
                        card,
                      )
                    }
                    type="button"
                  >
                    Activate card
                  </button>
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
              Branches
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {
                branches.length
              } locations
            </h2>
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
            onSubmit={
              add
            }
          >
            <label className="casa-label">
              <span>
                Name
              </span>
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
                value={
                  name
                }
              />
            </label>
            <label className="casa-label">
              <span>
                Code
              </span>
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
                value={
                  code
                }
              />
            </label>
            <label className="casa-label sm:col-span-2">
              <span>
                Address
              </span>
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
                value={
                  address
                }
              />
            </label>
            <button
              className="casa-button-primary"
              disabled={
                busy
              }
            >
              Create branch
            </button>
          </form>
        ) : null}

        {branches.map(
          (
            branch,
          ) => (
            <div
              className="grid gap-3 border-b border-black/15 p-5 last:border-b-0 sm:grid-cols-[1fr_auto_auto] sm:items-center"
              key={
                branch.id
              }
            >
              <div>
                <p className="font-semibold">
                  {
                    branch.name
                  }
                  {branch.is_headquarters
                    ? " · HQ"
                    : ""}
                </p>
                <p className="mt-1 font-mono text-[9px] uppercase text-black/40">
                  {
                    branch.code
                  } · {
                    branch.status
                  }
                </p>
              </div>
              <div className="text-sm sm:text-right">
                <p className="font-medium">
                  {
                    branch.student_count
                  } registered
                </p>
                <p className="mt-1 text-xs text-black/45">
                  {
                    branch.enrolled_count
                  } academically enrolled
                </p>
              </div>
              <p className="text-sm text-black/50 sm:max-w-[18rem] sm:text-right">
                {
                  branch.address ??
                  "No address"
                }
              </p>
            </div>
          ),
        )}
      </section>

      <CasaConfirmDialog
        busy={
          busy
        }
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
          void confirmPendingAction()
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
