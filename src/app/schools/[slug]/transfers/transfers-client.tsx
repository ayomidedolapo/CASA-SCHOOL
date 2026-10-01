"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

type TransferRow = {
  id: string;
  student_id: string;
  student_name: string;
  casa_student_id: string;
  source_branch_id: string;
  source_branch_name: string;
  target_branch_id: string;
  target_branch_name: string;
  target_class_arm_id:
    string | null;
  status:
    | "PENDING"
    | "CONFIRMED"
    | "REJECTED"
    | "CANCELLED";
  reason: string | null;
  requested_at: string;
  decided_at:
    string | null;
};

type ClassOption = {
  branch_id: string;
  class_arm_id: string;
  class_name: string;
};

type Workspace = {
  branches: Array<{
    id: string;
    name: string;
    code: string;
  }>;
  classOptions:
    ClassOption[];
  incoming:
    TransferRow[];
  outgoing:
    TransferRow[];
};

const empty: Workspace = {
  branches: [],
  classOptions: [],
  incoming: [],
  outgoing: [],
};

export default function TransfersClient({
  slug,
  schoolName,
}: {
  slug: string;
  schoolName: string;
}) {
  const [
    data,
    setData,
  ] =
    useState<Workspace>(
      empty,
    );
  const [
    choices,
    setChoices,
  ] =
    useState<
      Record<
        string,
        string
      >
    >({});
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

  const endpoint =
    `/api/schools/${encodeURIComponent(
      slug,
    )}/transfers`;

  const load =
    useCallback(
      async () => {
        const response =
          await fetch(
            endpoint,
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
              : "Transfers could not be loaded.",
          );
        }

        setData(
          body as Workspace,
        );
      },
      [endpoint],
    );

  useEffect(() => {
    void load().catch(
      (cause) =>
        setError(
          cause instanceof
            Error
            ? cause.message
            : "Transfers could not be loaded.",
        ),
    );
  }, [load]);

  async function act(
    transferId: string,
    action:
      | "CONFIRM"
      | "REJECT"
      | "CANCEL",
  ) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response =
        await fetch(
          `${endpoint}/${encodeURIComponent(
            transferId,
          )}`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify(
                action ===
                  "CONFIRM"
                  ? {
                      action,
                      targetClassArmId:
                        choices[
                          transferId
                        ] ??
                        "",
                    }
                  : {
                      action,
                    },
              ),
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
            : "Transfer action failed.",
        );
      }

      setNotice(
        action ===
          "CONFIRM"
          ? "Transfer confirmed. The student's active enrollment and terminal authority now belong to the destination branch."
          : action ===
              "REJECT"
            ? "Transfer rejected. The student's original branch access has been restored."
            : "Transfer cancelled. The student's original branch access has been restored.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Transfer action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  const pendingIncoming =
    data.incoming.filter(
      (item) =>
        item.status ===
        "PENDING",
    );

  return (
    <main className="casa-shell min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Branch Transfers
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
              {schoolName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              A transfer requested during an active session suspends the student from attendance terminals until the destination branch confirms or rejects it. Confirmation moves the active enrollment without creating a duplicate student or a new physical card.
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
              )}/progression`}
            >
              Session progression
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

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="border border-black bg-white">
            <div className="border-b border-black p-5">
              <p className="casa-kicker text-black/40">
                Destination review
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Incoming requests
              </h2>
            </div>
            {pendingIncoming.length ===
            0 ? (
              <p className="p-5 text-sm text-black/45">
                No pending incoming transfer requests.
              </p>
            ) : (
              pendingIncoming.map(
                (item) => {
                  const options =
                    data.classOptions.filter(
                      (option) =>
                        option.branch_id ===
                        item.target_branch_id,
                    );

                  return (
                    <article
                      key={item.id}
                      className="border-b border-black/15 p-5 last:border-b-0"
                    >
                      <p className="font-semibold">
                        {item.student_name}
                      </p>
                      <p className="mt-1 font-mono text-[10px] uppercase text-black/45">
                        {item.casa_student_id}
                      </p>
                      <p className="mt-3 text-sm">
                        {item.source_branch_name} → {item.target_branch_name}
                      </p>
                      {item.reason ? (
                        <p className="mt-2 text-xs leading-5 text-black/50">
                          {item.reason}
                        </p>
                      ) : null}
                      <label className="casa-label mt-4">
                        <span>
                          Destination class
                        </span>
                        <select
                          className="casa-field"
                          value={
                            choices[
                              item.id
                            ] ??
                            ""
                          }
                          onChange={(
                            event,
                          ) =>
                            setChoices(
                              (
                                current,
                              ) => ({
                                ...current,
                                [item.id]:
                                  event
                                    .target
                                    .value,
                              }),
                            )
                          }
                        >
                          <option
                            value=""
                            disabled
                          >
                            Select class
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
                                  option.class_name
                                }
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button
                          type="button"
                          className="casa-button-primary"
                          disabled={
                            busy ||
                            !choices[
                              item.id
                            ]
                          }
                          onClick={() =>
                            void act(
                              item.id,
                              "CONFIRM",
                            )
                          }
                        >
                          Confirm transfer
                        </button>
                        <button
                          type="button"
                          className="casa-button"
                          disabled={busy}
                          onClick={() =>
                            void act(
                              item.id,
                              "REJECT",
                            )
                          }
                        >
                          Reject
                        </button>
                      </div>
                    </article>
                  );
                },
              )
            )}
          </div>

          <div className="border border-black bg-white">
            <div className="border-b border-black p-5">
              <p className="casa-kicker text-black/40">
                Source branch
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Outgoing transfer history
              </h2>
            </div>
            {data.outgoing.length ===
            0 ? (
              <p className="p-5 text-sm text-black/45">
                No outgoing transfer requests.
              </p>
            ) : (
              data.outgoing.map(
                (item) => (
                  <article
                    key={item.id}
                    className="border-b border-black/15 p-5 last:border-b-0"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold">
                          {
                            item.student_name
                          }
                        </p>
                        <p className="mt-1 text-sm text-black/50">
                          {item.source_branch_name} → {item.target_branch_name}
                        </p>
                      </div>
                      <span className="font-mono text-[9px] uppercase">
                        {item.status}
                      </span>
                    </div>
                    {item.status ===
                    "PENDING" ? (
                      <button
                        type="button"
                        className="casa-button mt-4"
                        disabled={busy}
                        onClick={() =>
                          void act(
                            item.id,
                            "CANCEL",
                          )
                        }
                      >
                        Cancel request
                      </button>
                    ) : null}
                  </article>
                ),
              )
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
