"use client";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  obtainPasskeyStepUpGrant,
} from "@/client/passkey-step-up";

interface BulkCardActivationProps {
  schoolSlug: string;
}

interface BranchReadiness {
  totalReadyCards: number;
  eligibleCount: number;
  awaitingPrintCount: number;
  awaitingFaceCount: number;
  manualReviewCount: number;
}

interface BranchRow {
  id: string;
  name: string;
  code: string;
  isHeadquarters: boolean;
  readiness: BranchReadiness;
}

interface ReadinessResponse {
  organizationAdmin: boolean;
  branches: BranchRow[];
}

function messageFromUnknown(
  value: unknown,
  fallback: string,
) {
  if (
    value &&
    typeof value === "object" &&
    "message" in value &&
    typeof value.message === "string"
  ) {
    return value.message;
  }

  return fallback;
}

export function BulkCardActivation({
  schoolSlug,
}: BulkCardActivationProps) {
  const [data, setData] =
    useState<ReadinessResponse | null>(
      null,
    );
  const [loading, setLoading] =
    useState(true);
  const [busyBranchId, setBusyBranchId] =
    useState<string | null>(null);
  const [error, setError] =
    useState<string | null>(null);
  const [notice, setNotice] =
    useState<string | null>(null);

  const endpoint =
    `/api/schools/${encodeURIComponent(
      schoolSlug,
    )}/registry/card-activation-batches`;

  const load =
    useCallback(
      async () => {
        const response =
          await fetch(
            endpoint,
            {
              credentials:
                "same-origin",
              cache:
                "no-store",
            },
          );
        const body: unknown =
          await response.json();

        if (!response.ok) {
          throw new Error(
            messageFromUnknown(
              body,
              "Unable to load campus card-activation readiness.",
            ),
          );
        }

        setData(
          body as
            ReadinessResponse,
        );
      },
      [endpoint],
    );

  useEffect(
    () => {
      const controller =
        new AbortController();

      void fetch(
        endpoint,
        {
          credentials:
            "same-origin",
          cache:
            "no-store",
          signal:
            controller.signal,
        },
      )
        .then(
          async (response) => {
            const body: unknown =
              await response.json();

            if (!response.ok) {
              throw new Error(
                messageFromUnknown(
                  body,
                  "Unable to load campus card-activation readiness.",
                ),
              );
            }

            return body as
              ReadinessResponse;
          },
        )
        .then((body) => {
          if (
            !controller.signal.aborted
          ) {
            setData(body);
            setError(null);
          }
        })
        .catch((cause) => {
          if (
            controller.signal.aborted
          ) {
            return;
          }

          setError(
            cause instanceof Error
              ? cause.message
              : "Unable to load campus card-activation readiness.",
          );
        })
        .finally(() => {
          if (
            !controller.signal.aborted
          ) {
            setLoading(false);
          }
        });

      return () => {
        controller.abort();
      };
    },
    [endpoint],
  );

  async function activate(
    branch: BranchRow,
  ) {
    if (
      branch.readiness
        .eligibleCount === 0
    ) {
      return;
    }

    setBusyBranchId(
      branch.id,
    );
    setError(null);
    setNotice(null);

    try {
      const grant =
        await obtainPasskeyStepUpGrant({
          schoolSlug,
          action:
            "CARD_BULK_ACTIVATE",
        });

      const response =
        await fetch(
          endpoint,
          {
            method:
              "POST",
            credentials:
              "same-origin",
            cache:
              "no-store",
            headers: {
              "Content-Type":
                "application/json",
              "x-casa-passkey-step-up":
                grant,
            },
            body:
              JSON.stringify({
                branchId:
                  branch.id,
                confirmPhysicalHandover:
                  true,
                reason:
                  "Campus card handover confirmed",
              }),
          },
        );

      const body:
        unknown =
          await response.json();

      if (!response.ok) {
        throw new Error(
          messageFromUnknown(
            body,
            "Campus card activation failed.",
          ),
        );
      }

      const result =
        body as {
          activatedCount?: number;
        };

      setNotice(
        `${result.activatedCount ?? 0} card(s) activated for ${branch.name} with one Passkey authorization.`,
      );

      await load();

      window.dispatchEvent(
        new Event(
          "casa:card-activation-batch-complete",
        ),
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Campus card activation failed.",
      );
    } finally {
      setBusyBranchId(null);
    }
  }

  if (
    !loading &&
    data &&
    data.branches.length === 0
  ) {
    return null;
  }

  return (
    <section className="mb-6 border border-black bg-[#f2f2ef]">
      <div className="grid gap-5 border-b border-black p-5 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <p className="casa-kicker text-black/45">
            Card activation
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.03em]">
            Activate ready cards in one Passkey ceremony
          </h3>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-black/55">
            The school activates only cards that have been printed and whose student has completed face registration. Branch Admins activate their own campus; HQ Admins activate HQ only. CASA Team can print and audit cards but cannot activate them.
          </p>
        </div>
        <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-black/40">
          {data?.organizationAdmin
            ? "School-wide authority"
            : "Branch-scoped authority"}
        </p>
      </div>

      {error ? (
        <p
          className="casa-error m-4"
          role="alert"
        >
          {error}
        </p>
      ) : null}

      {notice ? (
        <p
          className="casa-notice m-4 text-[var(--casa-positive)]"
          role="status"
        >
          {notice}
        </p>
      ) : null}

      {loading ? (
        <p className="p-5 text-sm text-black/45">
          Checking campus card readiness...
        </p>
      ) : (
        <div className="divide-y divide-black/20">
          {data?.branches.map(
            (branch) => {
              const readiness =
                branch.readiness;
              const busy =
                busyBranchId ===
                branch.id;

              return (
                <article
                  key={branch.id}
                  className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-3">
                      <h4 className="font-semibold">
                        {branch.name}
                      </h4>
                      {branch.isHeadquarters ? (
                        <span className="casa-status casa-status-positive">
                          HQ
                        </span>
                      ) : null}
                      <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-black/40">
                        {branch.code}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-px border border-black/20 bg-black/20 sm:grid-cols-4">
                      {[
                        [
                          "Ready to activate",
                          readiness.eligibleCount,
                        ],
                        [
                          "Waiting for printing",
                          readiness.awaitingPrintCount,
                        ],
                        [
                          "Waiting for face",
                          readiness.awaitingFaceCount,
                        ],
                        [
                          "Needs attention",
                          readiness.manualReviewCount,
                        ],
                      ].map(
                        ([label, value]) => (
                          <div
                            key={label}
                            className="bg-white p-3"
                          >
                            <strong className="block text-2xl font-semibold tabular-nums">
                              {value}
                            </strong>
                            <span className="mt-1 block font-mono text-[8px] uppercase tracking-[0.08em] text-black/45">
                              {label}
                            </span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="casa-button min-w-60"
                    disabled={
                      Boolean(
                        busyBranchId,
                      ) ||
                      readiness.eligibleCount ===
                        0
                    }
                    onClick={() =>
                      void activate(
                        branch,
                      )
                    }
                  >
                    {busy
                      ? "Authorizing..."
                      : readiness.eligibleCount ===
                          0
                        ? "No cards ready"
                        : `Activate ${readiness.eligibleCount} with Passkey`}
                  </button>
                </article>
              );
            },
          )}
        </div>
      )}
    </section>
  );
}
