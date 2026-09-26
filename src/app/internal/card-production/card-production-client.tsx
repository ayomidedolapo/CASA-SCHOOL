"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import {
  CasaInputDialog,
} from "@/components/casa-input-dialog";

type School = {
  id: string;
  name: string;
  slug: string;
};

type Branch = {
  id: string;
  school_id: string;
  name: string;
};

type Template = {
  id: string;
  school_id: string;
  school_name: string;
  version_label: string;
  status: string;
  activated_at:
    string | null;
  created_at: string;
};

type Snapshot = {
  schoolName?: string;
  studentName?: string;
  casaStudentId?: string;
  admissionNumber?:
    string | null;
  className?:
    string | null;
  cardSerial?: string;
  branchId?:
    string | null;
  branchName?:
    string | null;
};

type CardCategory =
  | "FIRST_CARD"
  | "REPLACEMENT"
  | "OTHER";

type Job = {
  id: string;
  schoolId: string;
  studentId: string;
  cardId: string;
  status:
    | "READY"
    | "EXPORTED"
    | "PRINTED";
  category:
    CardCategory;
  cardStatus: string;
  publicLinkRevision:
    number;
  renderSnapshot:
    Snapshot;
  queuedAt: string;
  exportedAt:
    string | null;
  printedAt:
    string | null;
  templateVersion:
    string;
  publicUrl: string;
};

type WaitingStudent = {
  student_id: string;
  student_name: string;
  casa_student_id:
    string;
  branch_id:
    string | null;
  branch_name:
    string | null;
  class_name:
    string | null;
};

type ReplacementStudent =
  WaitingStudent & {
    case_id: string;
    replacement_reason:
      "LOST" |
      "DAMAGED";
  };

type ReplacementBatch = {
  school_id: string;
  school_name: string;
  batch_eligible_on:
    string;
  student_count:
    number;
  due: boolean;
  students:
    ReplacementStudent[];
};

type FirstCardBatch = {
  school_id: string;
  school_name: string;
  scheduled_for:
    string;
  student_count:
    number;
  students:
    Array<
      WaitingStudent & {
        job_id: string;
      }
    >;
};

function fmt(
  value:
    string |
    null |
    undefined,
) {
  if (!value) {
    return "—";
  }

  const date =
    new Date(
      value,
    );

  return Number.isNaN(
    date.getTime(),
  )
    ? value
    : date.toLocaleString(
        "en-NG",
      );
}

function categoryLabel(
  category:
    CardCategory,
) {
  if (
    category ===
      "FIRST_CARD"
  ) {
    return "New student / first card";
  }

  if (
    category ===
      "REPLACEMENT"
  ) {
    return "Replacement";
  }

  return "Other / reissue";
}

export default function CardProductionClient(
  {
    schools,
    branches,
    templates,
  }: {
    schools:
      School[];
    branches:
      Branch[];
    templates:
      Template[];
  },
) {
  const [
    jobs,
    setJobs,
  ] =
    useState<Job[]>(
      [],
    );
  const [
    status,
    setStatus,
  ] =
    useState("");
  const [
    category,
    setCategory,
  ] =
    useState("");
  const [
    schoolId,
    setSchoolId,
  ] =
    useState("");
  const [
    branchId,
    setBranchId,
  ] =
    useState("");
  const [
    busy,
    setBusy,
  ] =
    useState(false);
  const [
    message,
    setMessage,
  ] =
    useState<
      string | null
    >(
      null,
    );
  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(
      null,
    );
  const [
    rotateJob,
    setRotateJob,
  ] =
    useState<
      Job | null
    >(
      null,
    );
  const [
    replacementBatches,
    setReplacementBatches,
  ] =
    useState<
      ReplacementBatch[]
    >(
      [],
    );
  const [
    firstCardBatches,
    setFirstCardBatches,
  ] =
    useState<
      FirstCardBatch[]
    >(
      [],
    );

  const availableBranches =
    useMemo(
      () =>
        branches.filter(
          (branch) =>
            !schoolId ||
            branch.school_id ===
              schoolId,
        ),
      [
        branches,
        schoolId,
      ],
    );

  const queueParams =
    useCallback(
      () => {
        const params =
          new URLSearchParams({
            limit:
              "250",
          });

        if (status) {
          params.set(
            "status",
            status,
          );
        }

        if (category) {
          params.set(
            "category",
            category,
          );
        }

        if (schoolId) {
          params.set(
            "schoolId",
            schoolId,
          );
        }

        if (branchId) {
          params.set(
            "branchId",
            branchId,
          );
        }

        return params;
      },
      [
        status,
        category,
        schoolId,
        branchId,
      ],
    );

  const scheduledParams =
    useCallback(
      () => {
        const params =
          new URLSearchParams();

        if (schoolId) {
          params.set(
            "schoolId",
            schoolId,
          );
        }

        if (branchId) {
          params.set(
            "branchId",
            branchId,
          );
        }

        return params;
      },
      [
        schoolId,
        branchId,
      ],
    );

  const loadQueue =
    useCallback(
      async () => {
        const response =
          await fetch(
            `/api/internal/operations/card-production/jobs?${queueParams()}`,
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
              jobs?:
                Job[];
              message?:
                string;
            } | null;

        if (!response.ok) {
          throw new Error(
            body?.message ??
              "Unable to load card production queue.",
          );
        }

        setJobs(
          body?.jobs ??
            [],
        );
      },
      [
        queueParams,
      ],
    );

  const loadScheduled =
    useCallback(
      async () => {
        const params =
          scheduledParams();

        const [
          firstResponse,
          replacementResponse,
        ] =
          await Promise.all([
            fetch(
              `/api/internal/operations/card-production/scheduled-first-cards?${params}`,
              {
                cache:
                  "no-store",
                credentials:
                  "same-origin",
              },
            ),
            fetch(
              `/api/internal/operations/card-production/replacement-batches?${params}`,
              {
                cache:
                  "no-store",
                credentials:
                  "same-origin",
              },
            ),
          ]);

        const firstBody =
          await firstResponse
            .json()
            .catch(
              () => null,
            ) as {
              batches?:
                FirstCardBatch[];
              message?:
                string;
            } | null;

        const replacementBody =
          await replacementResponse
            .json()
            .catch(
              () => null,
            ) as {
              batches?:
                ReplacementBatch[];
              message?:
                string;
            } | null;

        if (
          !firstResponse.ok
        ) {
          throw new Error(
            firstBody?.message ??
              "Unable to load scheduled first cards.",
          );
        }

        if (
          !replacementResponse.ok
        ) {
          throw new Error(
            replacementBody?.message ??
              "Unable to load scheduled replacement cards.",
          );
        }

        setFirstCardBatches(
          firstBody?.batches ??
            [],
        );
        setReplacementBatches(
          replacementBody?.batches ??
            [],
        );
      },
      [
        scheduledParams,
      ],
    );

  const reload =
    useCallback(
      async () => {
        setError(
          null,
        );

        await Promise.all([
          loadQueue(),
          loadScheduled(),
        ]);
      },
      [
        loadQueue,
        loadScheduled,
      ],
    );

  useEffect(
    () => {
      let cancelled =
        false;

      const initial =
        window.setTimeout(
          () => {
            void Promise.all([
              loadQueue(),
              loadScheduled(),
            ]).catch(
              (caught) => {
                if (cancelled) {
                  return;
                }

                setError(
                  caught instanceof
                    Error
                    ? caught.message
                    : "Unable to load card production.",
                );
              },
            );
          },
          0,
        );

      return () => {
        cancelled =
          true;
        window.clearTimeout(
          initial,
        );
      };
    },
    [
      loadQueue,
      loadScheduled,
    ],
  );

  const counts =
    useMemo(
      () => ({
        ready:
          jobs.filter(
            (job) =>
              job.status ===
              "READY",
          ).length,
        exported:
          jobs.filter(
            (job) =>
              job.status ===
              "EXPORTED",
          ).length,
        printed:
          jobs.filter(
            (job) =>
              job.status ===
              "PRINTED",
          ).length,
      }),
      [
        jobs,
      ],
    );

  async function action(
    job:
      Job,
    kind:
      | "MARK_PRINTED"
      | "ROTATE_PUBLIC_LINK",
    reason = "",
  ) {
    if (
      kind ===
        "ROTATE_PUBLIC_LINK" &&
      reason.trim().length <
        3
    ) {
      setRotateJob(
        job,
      );
      return;
    }

    setBusy(
      true,
    );
    setError(
      null,
    );
    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          `/api/internal/operations/card-production/jobs/${encodeURIComponent(
            job.id,
          )}`,
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
                  kind,
                reason:
                  reason.trim() ||
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
            message?:
              string;
          } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ??
            "Card production action failed.",
        );
      }

      setMessage(
        kind ===
          "MARK_PRINTED"
          ? "Production job marked printed."
          : "Public card link rotated.",
      );
      setRotateJob(
        null,
      );
      await reload();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Card production action failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function releaseReplacementBatch(
    batch:
      ReplacementBatch,
  ) {
    if (!batch.due) {
      return;
    }

    if (
      !window.confirm(
        `Release ${batch.student_count} paid replacement card(s) for ${batch.school_name}, scheduled for ${batch.batch_eligible_on}${branchId ? " in the selected branch" : ""}?`,
      )
    ) {
      return;
    }

    setBusy(
      true,
    );
    setError(
      null,
    );
    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          "/api/internal/operations/card-production/replacement-batches",
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
                schoolId:
                  batch.school_id,
                batchEligibleOn:
                  batch.batch_eligible_on,
                branchId:
                  branchId ||
                  null,
                limit:
                  500,
              }),
          },
        );

      const body =
        await response
          .json()
          .catch(
            () => null,
          ) as {
            produced?:
              number;
            failed?:
              number;
            message?:
              string;
          } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ??
            "Replacement batch release failed.",
        );
      }

      setMessage(
        `Replacement batch released: ${body?.produced ?? 0} card(s) queued for central production${body?.failed ? `, ${body.failed} failed and remain pending` : ""}.`,
      );
      await reload();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Replacement batch release failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function refreshUnprintedCards() {
    setBusy(
      true,
    );
    setError(
      null,
    );
    setMessage(
      null,
    );

    try {
      const healthResponse =
        await fetch(
          "/api/internal/operations/card-production/render-health",
          {
            cache:
              "no-store",
            credentials:
              "same-origin",
          },
        );

      const health =
        await healthResponse
          .json()
          .catch(
            () => null,
          ) as {
            healthy?:
              boolean;
            message?:
              string;
          } | null;

      if (
        !healthResponse.ok ||
        !health?.healthy
      ) {
        throw new Error(
          health?.message ??
            "The deployed card text renderer is not healthy. No card artifacts were refreshed.",
        );
      }

      const response =
        await fetch(
          "/api/internal/operations/card-production/refresh-unprinted",
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
                schoolId:
                  schoolId ||
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
            message?:
              string;
            refreshed?:
              number;
            requeuedFromExported?:
              number;
            skipped?:
              number;
            failed?:
              number;
          } | null;

      if (!response.ok) {
        throw new Error(
          body?.message ??
            "Unprinted card artwork refresh failed.",
        );
      }

      const summary =
        `Renderer healthy. Card artwork refresh: ${body?.refreshed ?? 0} refreshed, ${body?.requeuedFromExported ?? 0} exported card(s) requeued, ${body?.skipped ?? 0} skipped, ${body?.failed ?? 0} failed.`;

      if (
        (body?.failed ??
          0) >
        0
      ) {
        setError(
          summary,
        );
      } else {
        setMessage(
          summary,
        );
      }

      await reload();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Unprinted card artwork refresh failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  async function exportManifest() {
    const manifestStatus =
      status ||
      (
        jobs.length > 0 &&
        jobs.every(
          (job) =>
            job.status ===
              "PRINTED",
        )
          ? "PRINTED"
          : null
      );

    setBusy(
      true,
    );
    setError(
      null,
    );
    setMessage(
      null,
    );

    try {
      const response =
        await fetch(
          "/api/internal/operations/card-production/manifest",
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
                status:
                  manifestStatus,
                category:
                  category ||
                  null,
                schoolId:
                  schoolId ||
                  null,
                branchId:
                  branchId ||
                  null,
                limit:
                  1000,
              }),
          },
        );

      if (!response.ok) {
        const body =
          await response
            .json()
            .catch(
              () => null,
            ) as {
              message?:
                string;
            } | null;

        throw new Error(
          body?.message ??
            "Manifest export failed.",
        );
      }

      const blob =
        await response.blob();
      const url =
        URL.createObjectURL(
          blob,
        );
      const anchor =
        document.createElement(
          "a",
        );

      anchor.href =
        url;
      anchor.download =
        `casa-card-production-${new Date().toISOString().slice(0, 10)}.xlsx`;
      anchor.click();
      URL.revokeObjectURL(
        url,
      );

      setMessage(
        manifestStatus ===
          "PRINTED"
          ? "Printed card history exported again. Existing PRINTED status and production history were not changed."
          : "Manifest exported from current filters. Only due, unprinted jobs whose linked card is still valid for handover are exportable.",
      );
      await reload();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Manifest export failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  function waitingStudents(
    students:
      WaitingStudent[],
  ) {
    return (
      <div className="mt-3 divide-y divide-black/10 border-t border-black/10">
        {students.map(
          (
            student,
          ) => (
            <div
              key={
                student.student_id
              }
              className="grid gap-1 py-3 text-xs sm:grid-cols-[1.4fr_1fr_1fr]"
            >
              <div>
                <p className="font-semibold">
                  {student.student_name}
                </p>
                <p className="font-mono text-[9px] text-black/40">
                  {student.casa_student_id}
                </p>
              </div>
              <p className="text-black/55">
                {student.branch_name ??
                  "Branch not resolved"}
              </p>
              <p className="text-black/55">
                {student.class_name ??
                  "Class not resolved"}
              </p>
            </div>
          ),
        )}
      </div>
    );
  }

  return (
    <div className="px-5 py-6 sm:px-8 lg:px-10 lg:py-8">
      <section className="grid border border-black bg-white sm:grid-cols-3">
        {[
          [
            "Ready to print",
            counts.ready,
          ],
          [
            "Printing / exported",
            counts.exported,
          ],
          [
            "Printed history",
            counts.printed,
          ],
        ].map(
          ([
            label,
            value,
          ]) => (
            <div
              key={
                String(
                  label,
                )
              }
              className="border-b border-black/15 p-5 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <p className="casa-kicker text-black/40">
                {label}
              </p>
              <p className="mt-7 text-4xl font-semibold tracking-[-0.06em]">
                {value}
              </p>
            </div>
          ),
        )}
      </section>

      <section className="mt-8 border border-black bg-white">
        <div className="border-b border-black p-5">
          <p className="casa-kicker text-black/40">
            Scheduled term-end cards
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            Students waiting for the next card run
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-black/50">
            New students registered after a term has started stay on supervised first-card attendance until term-end production. Paid lost/damaged replacements also wait for their scheduled batch. Expand any group to see the exact students before anything enters the print queue.
          </p>
        </div>

        <div className="grid lg:grid-cols-2">
          <div className="border-b border-black/15 p-5 lg:border-r lg:border-b-0">
            <h3 className="font-semibold">
              New students / first cards
            </h3>
            <p className="mt-1 text-xs leading-5 text-black/45">
              These production jobs release automatically on the scheduled term-end date.
            </p>

            {firstCardBatches.length ===
            0 ? (
              <p className="mt-5 text-sm text-black/45">
                No mid-term first cards are waiting under the current school/branch filter.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {firstCardBatches.map(
                  (
                    batch,
                  ) => (
                    <details
                      key={`${batch.school_id}:${batch.scheduled_for}`}
                      className="border border-black/15 p-4"
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {batch.school_name}
                            </p>
                            <p className="mt-1 text-xs text-black/45">
                              Scheduled{" "}
                              {batch.scheduled_for}
                            </p>
                          </div>
                          <span className="font-mono text-xs">
                            {batch.student_count}{" "}
                            card(s)
                          </span>
                        </div>
                      </summary>
                      {waitingStudents(
                        batch.students,
                      )}
                    </details>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="p-5">
            <h3 className="font-semibold">
              Lost & damaged replacements
            </h3>
            <p className="mt-1 text-xs leading-5 text-black/45">
              Paid cases stay here until due. CASA releases the due group into the central queue.
            </p>

            {replacementBatches.length ===
            0 ? (
              <p className="mt-5 text-sm text-black/45">
                No paid replacement cases are waiting under the current school/branch filter.
              </p>
            ) : (
              <div className="mt-4 space-y-3">
                {replacementBatches.map(
                  (
                    batch,
                  ) => (
                    <details
                      key={`${batch.school_id}:${batch.batch_eligible_on}`}
                      className="border border-black/15 p-4"
                    >
                      <summary className="cursor-pointer list-none">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div>
                            <p className="font-semibold">
                              {batch.school_name}
                            </p>
                            <p className="mt-1 text-xs text-black/45">
                              Scheduled{" "}
                              {batch.batch_eligible_on}
                            </p>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-mono text-xs">
                              {batch.student_count}{" "}
                              card(s)
                            </span>
                            <span
                              className={`casa-status ${batch.due ? "casa-status-positive" : "casa-status-warning"}`}
                            >
                              {batch.due
                                ? "DUE"
                                : "SCHEDULED"}
                            </span>
                          </div>
                        </div>
                      </summary>

                      {waitingStudents(
                        batch.students,
                      )}

                      <div className="mt-4 flex justify-end">
                        <button
                          type="button"
                          disabled={
                            busy ||
                            !batch.due
                          }
                          onClick={() =>
                            void releaseReplacementBatch(
                              batch,
                            )
                          }
                          className="border border-black px-3 py-2 text-xs disabled:opacity-40"
                        >
                          Release due batch
                        </button>
                      </div>
                    </details>
                  ),
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="mt-8 border border-black bg-white">
        <div className="grid gap-3 border-b border-black p-4 xl:grid-cols-[1fr_1fr_1fr_1fr_auto_auto_auto]">
          <select
            value={
              schoolId
            }
            onChange={(
              event,
            ) => {
              setSchoolId(
                event.target
                  .value,
              );
              setBranchId(
                "",
              );
            }}
            className="h-12 border border-black/20 bg-white px-3"
          >
            <option value="">
              All organizations
            </option>
            {schools.map(
              (
                school,
              ) => (
                <option
                  key={
                    school.id
                  }
                  value={
                    school.id
                  }
                >
                  {school.name}
                </option>
              ),
            )}
          </select>

          <select
            value={
              branchId
            }
            onChange={(
              event,
            ) =>
              setBranchId(
                event.target
                  .value,
              )
            }
            className="h-12 border border-black/20 bg-white px-3"
          >
            <option value="">
              All branches
            </option>
            {availableBranches.map(
              (
                branch,
              ) => (
                <option
                  key={
                    branch.id
                  }
                  value={
                    branch.id
                  }
                >
                  {branch.name}
                  {schoolId
                    ? ""
                    : ` · ${schools.find((school) => school.id === branch.school_id)?.name ?? ""}`}
                </option>
              ),
            )}
          </select>

          <select
            value={
              category
            }
            onChange={(
              event,
            ) =>
              setCategory(
                event.target
                  .value,
              )
            }
            className="h-12 border border-black/20 bg-white px-3"
          >
            <option value="">
              All card types
            </option>
            <option value="FIRST_CARD">
              New student / first card
            </option>
            <option value="REPLACEMENT">
              Replacement
            </option>
            <option value="OTHER">
              Other / reissue
            </option>
          </select>

          <select
            value={
              status
            }
            onChange={(
              event,
            ) =>
              setStatus(
                event.target
                  .value,
              )
            }
            className="h-12 border border-black/20 bg-white px-3"
          >
            <option value="">
              All statuses
            </option>
            <option>
              READY
            </option>
            <option>
              EXPORTED
            </option>
            <option>
              PRINTED
            </option>
          </select>

          <button
            type="button"
            onClick={() =>
              void reload()
                .catch(
                  (
                    caught,
                  ) =>
                    setError(
                      caught instanceof
                        Error
                        ? caught.message
                        : "Reload failed.",
                    ),
                )
            }
            className="border border-black px-4 py-3 text-sm"
          >
            Reload
          </button>

          <button
            type="button"
            disabled={
              busy ||
              templates.length ===
                0
            }
            onClick={() =>
              void refreshUnprintedCards()
            }
            className="border border-black px-4 py-3 text-sm disabled:opacity-40"
          >
            Refresh unprinted
          </button>

          <button
            type="button"
            disabled={
              busy ||
              jobs.length ===
                0
            }
            onClick={() =>
              void exportManifest()
            }
            className="casa-button-primary disabled:opacity-40"
          >
            Export filtered XLSX
          </button>
        </div>

        <div className="border-b border-black/10 px-5 py-3 text-xs text-black/45">
          Export protection: future scheduled jobs, printed history, and jobs whose linked card is LOST / REPLACED / REVOKED / otherwise no longer awaiting handover are excluded from new production manifests.
        </div>

        {(error ||
          message) && (
          <div
            className={`border-b border-black/15 px-5 py-4 text-sm ${error ? "text-red-700" : "text-black/60"}`}
          >
            {error ??
              message}
          </div>
        )}

        {jobs.length ===
        0 ? (
          <p className="p-8 text-sm text-black/50">
            No current card production jobs match this view.
          </p>
        ) : (
          <div className="divide-y divide-black/15">
            {jobs.map(
              (
                job,
                index,
              ) => (
                <article
                  key={
                    job.id
                  }
                  className="grid gap-4 p-5 xl:grid-cols-[3rem_1.3fr_0.9fr_0.8fr_auto] xl:items-center"
                >
                  <span className="font-mono text-[10px] text-black/30">
                    {String(
                      index +
                        1,
                    ).padStart(
                      2,
                      "0",
                    )}
                  </span>

                  <div>
                    <h3 className="font-semibold">
                      {job.renderSnapshot
                        ?.studentName ??
                        "Student"}
                    </h3>
                    <p className="mt-1 text-sm text-black/50">
                      {job.renderSnapshot
                        ?.schoolName ??
                        schools.find(
                          (
                            school,
                          ) =>
                            school.id ===
                            job.schoolId,
                        )?.name ??
                        "Organization"}
                      {job.renderSnapshot
                        ?.branchName
                        ? ` · ${job.renderSnapshot.branchName}`
                        : ""}
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase tracking-[0.08em] text-black/35">
                      {job.renderSnapshot
                        ?.casaStudentId ??
                        job.renderSnapshot
                          ?.cardSerial ??
                        job.id}
                    </p>
                  </div>

                  <div>
                    <p className="font-semibold">
                      {categoryLabel(
                        job.category,
                      )}
                    </p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.1em] text-black/45">
                      {job.status}
                    </p>
                    <p className="mt-1 text-xs text-black/40">
                      Template{" "}
                      {job.templateVersion}
                    </p>
                  </div>

                  <div className="text-xs text-black/45">
                    <p>
                      Queued{" "}
                      {fmt(
                        job.queuedAt,
                      )}
                    </p>
                    <p className="mt-1">
                      Printed{" "}
                      {fmt(
                        job.printedAt,
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <a
                      href={`/api/internal/operations/card-production/jobs/${encodeURIComponent(
                        job.id,
                      )}/preview`}
                      target="_blank"
                      rel="noreferrer"
                      className="border border-black px-3 py-2 text-xs"
                    >
                      Preview
                    </a>

                    {job.status !==
                    "PRINTED" ? (
                      <button
                        disabled={
                          busy
                        }
                        onClick={() =>
                          void action(
                            job,
                            "MARK_PRINTED",
                          )
                        }
                        className="border border-black px-3 py-2 text-xs disabled:opacity-40"
                      >
                        Mark printed
                      </button>
                    ) : null}

                    <button
                      disabled={
                        busy
                      }
                      onClick={() =>
                        void action(
                          job,
                          "ROTATE_PUBLIC_LINK",
                        )
                      }
                      className="border border-black/25 px-3 py-2 text-xs disabled:opacity-40"
                    >
                      Rotate link
                    </button>
                  </div>
                </article>
              ),
            )}
          </div>
        )}
      </section>

      <section className="mt-8 border border-black bg-white">
        <div className="border-b border-black p-5">
          <p className="casa-kicker text-black/40">
            Master templates
          </p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.04em]">
            Registered school templates
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-black/50">
            Every version is tied to one school. The Templates workspace provides the full front/back gallery.
          </p>
        </div>

        {templates.length ===
        0 ? (
          <p className="p-8 text-sm text-black/50">
            No master card template is registered yet.
          </p>
        ) : (
          <div className="divide-y divide-black/15">
            {templates.map(
              (
                template,
              ) => (
                <div
                  key={
                    template.id
                  }
                  className="grid gap-3 p-5 md:grid-cols-[minmax(0,1fr)_auto_auto]"
                >
                  <div>
                    <p className="font-semibold">
                      {template.school_name}
                    </p>
                    <p className="mt-1 text-sm text-black/45">
                      {template.version_label}
                    </p>
                  </div>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em]">
                    {template.status}
                  </span>
                  <span className="text-xs text-black/40">
                    {template.activated_at
                      ? `Activated ${fmt(template.activated_at)}`
                      : `Created ${fmt(template.created_at)}`}
                  </span>
                </div>
              ),
            )}
          </div>
        )}
      </section>

      <CasaInputDialog
        open={
          rotateJob !==
          null
        }
        title="Rotate public card link"
        message="Enter the reason for rotating this public card link. The reason is retained in the production audit history."
        label="Reason"
        minLength={
          3
        }
        maxLength={
          240
        }
        confirmLabel="Rotate link"
        busy={
          busy
        }
        onCancel={() =>
          setRotateJob(
            null,
          )
        }
        onConfirm={(
          reason,
        ) => {
          if (
            rotateJob
          ) {
            void action(
              rotateJob,
              "ROTATE_PUBLIC_LINK",
              reason,
            );
          }
        }}
      />
    </div>
  );
}
