"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Session = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
};

type Branch = {
  id: string;
  name: string;
  code: string;
  is_headquarters: boolean;
};

type ClassArm = {
  branch_id: string;
  branch_name: string;
  class_arm_id: string;
  class_arm_name: string;
  class_level_id: string;
  class_level_name: string;
  class_level_sort_order: number;
  section_sort_order: number;
  section_name:
    string | null;
};

type Batch = {
  id: string;
  branch_id: string;
  status:
    | "DRAFT"
    | "CONFIRMED"
    | "CANCELLED";
  source_session_id: string;
  source_session_name: string;
  source_ends_on: string;
  target_session_id: string;
  target_session_name: string;
  target_starts_on: string;
  student_count?: number;
  pending_count?: number;
};

type DecisionName =
  | "PENDING"
  | "PROMOTED"
  | "TRANSITIONED"
  | "RETAINED"
  | "TRANSFERRED"
  | "GRADUATED"
  | "WITHDRAWN";

type Decision = {
  id: string;
  student_id: string;
  casa_student_id: string;
  first_name: string;
  middle_name:
    string | null;
  last_name: string;
  decision:
    DecisionName;
  target_class_arm_id:
    string | null;
  notes:
    string | null;
  source_class_level_id:
    string;
  source_class_level_name:
    string;
  source_class_level_sort_order:
    number;
  source_section_sort_order:
    number;
  source_class_arm_name:
    string;
  branch_id: string;
  suggestedTargetClassArmId:
    string | null;
};

type ContextData = {
  sessions: Session[];
  sourceBranches:
    Branch[];
  branches: Branch[];
  classArms:
    ClassArm[];
};

export default function ProgressionClient({
  slug,
  schoolName,
}: {
  slug: string;
  schoolName: string;
}) {
  const [
    context,
    setContext,
  ] =
    useState<ContextData>({
      sessions: [],
      sourceBranches: [],
      branches: [],
      classArms: [],
    });
  const [
    branchId,
    setBranchId,
  ] =
    useState("");
  const [
    sourceSessionId,
    setSourceSessionId,
  ] =
    useState("");
  const [
    targetSessionId,
    setTargetSessionId,
  ] =
    useState("");
  const [
    batches,
    setBatches,
  ] =
    useState<Batch[]>([]);
  const [
    selectedBatch,
    setSelectedBatch,
  ] =
    useState<Batch | null>(
      null,
    );
  const [
    decisions,
    setDecisions,
  ] =
    useState<Decision[]>([]);
  const [
    busy,
    setBusy,
  ] =
    useState(false);
  const [
    error,
    setError,
  ] =
    useState("");
  const [
    notice,
    setNotice,
  ] =
    useState("");

  const base =
    `/api/schools/${encodeURIComponent(
      slug,
    )}/progression`;

  const loadContext =
    useCallback(
      async () => {
        const response =
          await fetch(
            `${base}/context`,
            {
              cache:
                "no-store",
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
              : "Progression setup could not be loaded.",
          );
        }

        const next =
          body as ContextData;

        setContext(
          next,
        );
        setBranchId(
          (
            current,
          ) =>
            current ||
            next
              .sourceBranches[0]
              ?.id ||
            "",
        );
      },
      [base],
    );

  const loadBatches =
    useCallback(
      async (
        nextBranchId:
          string,
      ) => {
        if (!nextBranchId) {
          setBatches([]);
          return;
        }

        const response =
          await fetch(
            `${base}/batches?branchId=${encodeURIComponent(
              nextBranchId,
            )}`,
            {
              cache:
                "no-store",
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
              : "Progression batches could not be loaded.",
          );
        }

        setBatches(
          (
            body.batches ??
            []
          ) as Batch[],
        );
      },
      [base],
    );

  useEffect(() => {
    void loadContext().catch(
      (cause) =>
        setError(
          cause instanceof
            Error
            ? cause.message
            : "Progression setup could not be loaded.",
        ),
    );
  }, [loadContext]);

  useEffect(() => {
    void loadBatches(
      branchId,
    ).catch(
      (cause) =>
        setError(
          cause instanceof
            Error
            ? cause.message
            : "Progression batches could not be loaded.",
        ),
    );
  }, [
    branchId,
    loadBatches,
  ]);

  async function openBatch(
    batchId: string,
  ) {
    setBusy(true);
    setError("");

    try {
      const response =
        await fetch(
          `${base}/batches/${encodeURIComponent(
            batchId,
          )}/decisions`,
          {
            cache:
              "no-store",
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
            : "Progression review could not be loaded.",
        );
      }

      setSelectedBatch(
        body.batch as Batch,
      );
      setDecisions(
        (
          body.decisions ??
          []
        ) as Decision[],
      );
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Progression review could not be loaded.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createBatch() {
    if (
      !branchId ||
      !sourceSessionId ||
      !targetSessionId
    ) {
      setError(
        "Choose the branch, source session and target session.",
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response =
        await fetch(
          `${base}/batches`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                branchId,
                sourceSessionId,
                targetSessionId,
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
            : "Progression batch could not be created.",
        );
      }

      setNotice(
        "Progression review opened. You can prepare decisions before session-end, but final confirmation remains locked until the source session has ended.",
      );
      await loadBatches(
        branchId,
      );
      if (
        body.batch?.id
      ) {
        await openBatch(
          body.batch.id,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Progression batch could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  function choicesFor(
    decision: Decision,
    nextDecision:
      DecisionName,
  ) {
    if (
      nextDecision ===
        "GRADUATED" ||
      nextDecision ===
        "WITHDRAWN" ||
      nextDecision ===
        "PENDING"
    ) {
      return [];
    }

    return context.classArms.filter(
      (option) => {
        if (
          nextDecision ===
          "TRANSFERRED"
        ) {
          return (
            option.branch_id !==
            decision.branch_id
          );
        }

        if (
          option.branch_id !==
          decision.branch_id
        ) {
          return false;
        }

        if (
          nextDecision ===
          "RETAINED"
        ) {
          return (
            option.class_level_id ===
            decision.source_class_level_id
          );
        }

        if (
          nextDecision ===
          "PROMOTED"
        ) {
          return (
            option.section_sort_order ===
              decision.source_section_sort_order &&
            option.class_level_sort_order >
              decision.source_class_level_sort_order
          );
        }

        return (
          option.section_sort_order >
          decision.source_section_sort_order
        );
      },
    );
  }

  async function saveDecision(
    decision: Decision,
  ) {
    if (!selectedBatch) {
      return;
    }

    const targetRequired =
      [
        "PROMOTED",
        "TRANSITIONED",
        "RETAINED",
        "TRANSFERRED",
      ].includes(
        decision.decision,
      );

    if (
      targetRequired &&
      !decision
        .target_class_arm_id
    ) {
      setError(
        "Choose the destination class before saving this decision.",
      );
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response =
        await fetch(
          `${base}/batches/${encodeURIComponent(
            selectedBatch.id,
          )}/decisions`,
          {
            method:
              "PATCH",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                decisionId:
                  decision.id,
                decision:
                  decision.decision,
                targetClassArmId:
                  targetRequired
                    ? decision
                        .target_class_arm_id
                    : null,
                notes:
                  decision.notes,
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
            : "Progression decision could not be saved.",
        );
      }

      setNotice(
        "Student progression decision saved.",
      );
      await openBatch(
        selectedBatch.id,
      );
      await loadBatches(
        branchId,
      );
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Progression decision could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function confirmBatch() {
    if (!selectedBatch) {
      return;
    }

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response =
        await fetch(
          `${base}/batches/${encodeURIComponent(
            selectedBatch.id,
          )}/confirm`,
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
            : "Progression could not be confirmed.",
        );
      }

      setNotice(
        "Progression confirmed. Continuing students now have their next-session enrollment; graduated and withdrawn students have been closed out.",
      );
      await loadBatches(
        branchId,
      );
      await openBatch(
        selectedBatch.id,
      );
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Progression could not be confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const selectedSource =
    useMemo(
      () =>
        context.sessions.find(
          (session) =>
            session.id ===
            sourceSessionId,
        ) ??
        null,
      [
        context.sessions,
        sourceSessionId,
      ],
    );

  return (
    <main className="casa-shell min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Session Progression
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
              {schoolName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              Prepare the next-session result for every student. CASA never silently promotes a student. A draft may be prepared before the current session ends; confirmation is allowed only after its end date.
            </p>
          </div>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/registry`}
            >
              Registry
            </Link>
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/transfers`}
            >
              Branch transfers
            </Link>
            <Link
              className="casa-button"
              href={`/schools/${encodeURIComponent(
                slug,
              )}/academic`}
            >
              Academic setup
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
        {notice ? (
          <div className="mb-5 border border-black bg-[#e8f2ec] p-4 text-sm">
            {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mb-5 border border-[#8b221d] bg-[#f6e8e6] p-4 text-sm text-[#7e1d18]">
            {error}
          </div>
        ) : null}

        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            Prepare progression
          </p>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <label className="casa-label">
              <span>
                Branch
              </span>
              <select
                className="casa-field"
                value={branchId}
                onChange={(
                  event,
                ) => {
                  setBranchId(
                    event.target
                      .value,
                  );
                  setSelectedBatch(
                    null,
                  );
                  setDecisions(
                    [],
                  );
                }}
              >
                <option
                  value=""
                  disabled
                >
                  Select branch
                </option>
                {context.sourceBranches.map(
                  (branch) => (
                    <option
                      key={
                        branch.id
                      }
                      value={
                        branch.id
                      }
                    >
                      {
                        branch.name
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="casa-label">
              <span>
                Current / source session
              </span>
              <select
                className="casa-field"
                value={
                  sourceSessionId
                }
                onChange={(
                  event,
                ) =>
                  setSourceSessionId(
                    event.target
                      .value,
                  )
                }
              >
                <option
                  value=""
                  disabled
                >
                  Select session
                </option>
                {context.sessions.map(
                  (session) => (
                    <option
                      key={
                        session.id
                      }
                      value={
                        session.id
                      }
                    >
                      {
                        session.name
                      } · ends{" "}
                      {
                        session.ends_on
                      }
                    </option>
                  ),
                )}
              </select>
            </label>
            <label className="casa-label">
              <span>
                Next / target session
              </span>
              <select
                className="casa-field"
                value={
                  targetSessionId
                }
                onChange={(
                  event,
                ) =>
                  setTargetSessionId(
                    event.target
                      .value,
                  )
                }
              >
                <option
                  value=""
                  disabled
                >
                  Select next session
                </option>
                {context.sessions
                  .filter(
                    (session) =>
                      session.id !==
                      sourceSessionId,
                  )
                  .map(
                    (session) => (
                      <option
                        key={
                          session.id
                        }
                        value={
                          session.id
                        }
                      >
                        {
                          session.name
                        } · starts{" "}
                        {
                          session.starts_on
                        }
                      </option>
                    ),
                  )}
              </select>
            </label>
          </div>
          <p className="mt-3 text-xs leading-5 text-black/45">
            {selectedSource
              ? `Source session ends ${selectedSource.ends_on}. CASA will still block final confirmation until that date has passed.`
              : "Create the next academic session first, then prepare progression from the current session into it."}
          </p>
          <button
            type="button"
            className="casa-button-primary mt-4"
            disabled={busy}
            onClick={() =>
              void createBatch()
            }
          >
            Prepare progression batch
          </button>
        </section>

        <section className="mt-6 grid gap-6 xl:grid-cols-[360px_1fr]">
          <aside className="border border-black bg-white">
            <div className="border-b border-black p-5">
              <p className="casa-kicker text-black/40">
                Batches
              </p>
            </div>
            {batches.length ===
            0 ? (
              <p className="p-5 text-sm text-black/45">
                No progression batches for this branch yet.
              </p>
            ) : (
              batches.map(
                (batch) => (
                  <button
                    type="button"
                    key={
                      batch.id
                    }
                    onClick={() =>
                      void openBatch(
                        batch.id,
                      )
                    }
                    className="block w-full border-b border-black/15 p-5 text-left last:border-b-0"
                  >
                    <span className="block font-semibold">
                      {
                        batch.source_session_name
                      }{" "}
                      →{" "}
                      {
                        batch.target_session_name
                      }
                    </span>
                    <span className="mt-1 block text-xs text-black/45">
                      {batch.status} · {batch.student_count ?? 0} student(s) · {batch.pending_count ?? 0} pending
                    </span>
                  </button>
                ),
              )
            )}
          </aside>

          <div className="border border-black bg-white">
            {!selectedBatch ? (
              <p className="p-6 text-sm text-black/45">
                Open a batch to review every student.
              </p>
            ) : (
              <>
                <div className="border-b border-black p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="casa-kicker text-black/40">
                        Student review
                      </p>
                      <h2 className="mt-2 text-2xl font-semibold">
                        {
                          selectedBatch.source_session_name
                        }{" "}
                        →{" "}
                        {
                          selectedBatch.target_session_name
                        }
                      </h2>
                    </div>
                    <span className="font-mono text-[10px] uppercase">
                      {
                        selectedBatch.status
                      }
                    </span>
                  </div>
                </div>

                {decisions.map(
                  (decision) => {
                    const options =
                      choicesFor(
                        decision,
                        decision.decision,
                      );
                    const needsTarget =
                      [
                        "PROMOTED",
                        "TRANSITIONED",
                        "RETAINED",
                        "TRANSFERRED",
                      ].includes(
                        decision.decision,
                      );

                    return (
                      <article
                        key={
                          decision.id
                        }
                        className="border-b border-black/15 p-5 last:border-b-0"
                      >
                        <div className="grid gap-4 lg:grid-cols-[1fr_220px_280px_auto] lg:items-end">
                          <div>
                            <p className="font-semibold">
                              {decision.first_name}{" "}
                              {decision.middle_name ??
                                ""}{" "}
                              {decision.last_name}
                            </p>
                            <p className="mt-1 text-xs text-black/45">
                              Current:{" "}
                              {
                                decision.source_class_level_name
                              }{" "}
                              ·{" "}
                              {
                                decision.source_class_arm_name
                              }
                            </p>
                          </div>
                          <label className="casa-label">
                            <span>
                              Decision
                            </span>
                            <select
                              className="casa-field"
                              value={
                                decision.decision
                              }
                              disabled={
                                selectedBatch.status !==
                                "DRAFT"
                              }
                              onChange={(
                                event,
                              ) => {
                                const next =
                                  event
                                    .target
                                    .value as DecisionName;
                                setDecisions(
                                  (
                                    current,
                                  ) =>
                                    current.map(
                                      (
                                        item,
                                      ) =>
                                        item.id ===
                                        decision.id
                                          ? {
                                              ...item,
                                              decision:
                                                next,
                                              target_class_arm_id:
                                                [
                                                  "PROMOTED",
                                                  "TRANSITIONED",
                                                  "RETAINED",
                                                  "TRANSFERRED",
                                                ].includes(
                                                  next,
                                                )
                                                  ? item.suggestedTargetClassArmId ??
                                                    null
                                                  : null,
                                            }
                                          : item,
                                    ),
                                );
                              }}
                            >
                              <option value="PENDING">
                                Pending
                              </option>
                              <option value="PROMOTED">
                                Promoted
                              </option>
                              <option value="TRANSITIONED">
                                Transitioned
                              </option>
                              <option value="RETAINED">
                                Retained
                              </option>
                              <option value="TRANSFERRED">
                                Transferred at session change
                              </option>
                              <option value="GRADUATED">
                                Graduated
                              </option>
                              <option value="WITHDRAWN">
                                Withdrawn
                              </option>
                            </select>
                          </label>
                          <label className="casa-label">
                            <span>
                              Target class
                            </span>
                            <select
                              className="casa-field"
                              disabled={
                                !needsTarget ||
                                selectedBatch.status !==
                                  "DRAFT"
                              }
                              value={
                                decision.target_class_arm_id ??
                                ""
                              }
                              onChange={(
                                event,
                              ) =>
                                setDecisions(
                                  (
                                    current,
                                  ) =>
                                    current.map(
                                      (
                                        item,
                                      ) =>
                                        item.id ===
                                        decision.id
                                          ? {
                                              ...item,
                                              target_class_arm_id:
                                                event
                                                  .target
                                                  .value ||
                                                null,
                                            }
                                          : item,
                                    ),
                                )
                              }
                            >
                              <option value="">
                                {needsTarget
                                  ? "Select target"
                                  : "Not required"}
                              </option>
                              {options.map(
                                (
                                  option,
                                ) => (
                                  <option
                                    key={
                                      option.class_arm_id
                                    }
                                    value={
                                      option.class_arm_id
                                    }
                                  >
                                    {
                                      option.branch_name
                                    }{" "}
                                    ·{" "}
                                    {
                                      option.class_level_name
                                    }{" "}
                                    ·{" "}
                                    {
                                      option.class_arm_name
                                    }
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <button
                            type="button"
                            className="casa-button"
                            disabled={
                              busy ||
                              selectedBatch.status !==
                                "DRAFT"
                            }
                            onClick={() =>
                              void saveDecision(
                                decision,
                              )
                            }
                          >
                            Save
                          </button>
                        </div>
                      </article>
                    );
                  },
                )}

                {selectedBatch.status ===
                "DRAFT" ? (
                  <div className="p-5">
                    <p className="text-xs leading-5 text-black/50">
                      Immediate branch moves during a running session should use the dedicated Branch Transfers workflow. The TRANSFERRED decision here is specifically for a branch move that becomes effective with the next academic session.
                    </p>
                    <button
                      type="button"
                      className="casa-button-primary mt-4"
                      disabled={
                        busy ||
                        decisions.some(
                          (
                            decision,
                          ) =>
                            decision.decision ===
                            "PENDING",
                        )
                      }
                      onClick={() =>
                        void confirmBatch()
                      }
                    >
                      Confirm progression after session end
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
