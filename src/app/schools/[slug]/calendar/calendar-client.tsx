"use client";

import Link from "next/link";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

interface Branch {
  id: string;
  name: string;
  code: string;
  is_headquarters:
    boolean;
}

interface EventRow {
  id: string;
  branch_id:
    string | null;
  kind:
    | "PUBLIC_HOLIDAY"
    | "SCHOOL_BREAK"
    | "BRANCH_CLOSURE"
    | "SPECIAL_NON_INSTRUCTIONAL_DAY";
  title: string;
  starts_on: string;
  ends_on: string;
  notes:
    string | null;
}

const labels:
  Record<
    EventRow["kind"],
    string
  > = {
    PUBLIC_HOLIDAY:
      "Public holiday",
    SCHOOL_BREAK:
      "School break",
    BRANCH_CLOSURE:
      "Branch closure",
    SPECIAL_NON_INSTRUCTIONAL_DAY:
      "Special non-instructional day",
  };

export default function CalendarClient({
  slug,
  schoolName,
}: {
  slug: string;
  schoolName: string;
}) {
  const [branches, setBranches] =
    useState<Branch[]>([]);
  const [
    organizationAdmin,
    setOrganizationAdmin,
  ] =
    useState(false);
  const [events, setEvents] =
    useState<EventRow[]>([]);
  const [kind, setKind] =
    useState<EventRow["kind"]>(
      "PUBLIC_HOLIDAY",
    );
  const [busy, setBusy] =
    useState(false);
  const [error, setError] =
    useState("");
  const [notice, setNotice] =
    useState("");

  const range =
    useMemo(() => {
      const year =
        new Date()
          .getFullYear();
      return {
        startsOn:
          `${year}-01-01`,
        endsOn:
          `${year + 1}-12-31`,
      };
    }, []);

  const load =
    useCallback(
      async () => {
        const branchResponse =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/branches`,
            {
              cache:
                "no-store",
            },
          );
        const branchBody =
          await branchResponse
            .json()
            .catch(
              () => ({}),
            );
        if (
          !branchResponse.ok
        ) {
          throw new Error(
            typeof branchBody.message ===
              "string"
              ? branchBody.message
              : "Campuses could not be loaded.",
          );
        }

        const nextBranches =
          Array.isArray(
            branchBody.branches,
          )
            ? branchBody.branches as
                Branch[]
            : [];
        const nextOrganizationAdmin =
          branchBody.organizationAdmin ===
          true;

        const branchUrls =
          nextBranches.map(
            (branch) =>
              `/api/schools/${encodeURIComponent(
                slug,
              )}/calendar-events?startsOn=${range.startsOn}&endsOn=${range.endsOn}&branchId=${encodeURIComponent(
                branch.id,
              )}`,
          );
        const urls =
          nextOrganizationAdmin
            ? [
                `/api/schools/${encodeURIComponent(
                  slug,
                )}/calendar-events?startsOn=${range.startsOn}&endsOn=${range.endsOn}`,
                ...branchUrls,
              ]
            : branchUrls;

        const responses =
          await Promise.all(
            urls.map(
              (url) =>
                fetch(
                  url,
                  {
                    cache:
                      "no-store",
                  },
                ),
            ),
          );
        const bodies =
          await Promise.all(
            responses.map(
              (
                response,
              ) =>
                response
                  .json()
                  .catch(
                    () => ({}),
                  ),
            ),
          );
        const failedIndex =
          responses.findIndex(
            (
              response,
            ) =>
              !response.ok,
          );
        if (
          failedIndex >=
          0
        ) {
          throw new Error(
            typeof bodies[
              failedIndex
            ].message ===
              "string"
              ? bodies[
                  failedIndex
                ].message
              : "Calendar could not be loaded.",
          );
        }

        const deduped =
          new Map<
            string,
            EventRow
          >();
        for (
          const body of
          bodies
        ) {
          for (
            const event of
            Array.isArray(
              body.events,
            )
              ? body.events as
                  EventRow[]
              : []
          ) {
            deduped.set(
              event.id,
              event,
            );
          }
        }

        setBranches(
          nextBranches,
        );
        setOrganizationAdmin(
          nextOrganizationAdmin,
        );
        setEvents(
          [
            ...deduped.values(),
          ].sort(
            (a, b) =>
              a.starts_on.localeCompare(
                b.starts_on,
              ) ||
              a.title.localeCompare(
                b.title,
              ),
          ),
        );
      },
      [
        range.endsOn,
        range.startsOn,
        slug,
      ],
    );

  useEffect(() => {
    const timer =
      window.setTimeout(
        () => {
          void load()
            .catch(
              (cause) => {
                setError(
                  cause instanceof
                    Error
                    ? cause.message
                    : "Calendar could not be loaded.",
                );
              },
            );
        },
        0,
      );

    return () => {
      window.clearTimeout(
        timer,
      );
    };
  }, [load]);

  async function create(
    event:
      FormEvent<
        HTMLFormElement
      >,
  ) {
    event.preventDefault();
    const formElement =
      event.currentTarget;
    const form =
      new FormData(
        formElement,
      );
    const fixedBranchId =
      !organizationAdmin &&
      branches.length ===
        1
        ? branches[0].id
        : null;
    const selectedBranchId =
      String(
        form.get(
          "branchId",
        ) ?? "",
      ) ||
      fixedBranchId;
    const branchId =
      organizationAdmin &&
      kind ===
        "PUBLIC_HOLIDAY"
        ? null
        : selectedBranchId ||
          null;

    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/calendar-events`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                kind,
                title:
                  form.get(
                    "title",
                  ),
                startsOn:
                  form.get(
                    "startsOn",
                  ),
                endsOn:
                  form.get(
                    "endsOn",
                  ),
                branchId,
                notes:
                  form.get(
                    "notes",
                  ) ||
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
      if (!response.ok) {
        throw new Error(
          typeof body.message ===
            "string"
            ? body.message
            : "Calendar event could not be created.",
        );
      }
      formElement.reset();
      setKind(
        "PUBLIC_HOLIDAY",
      );
      setNotice(
        "Calendar event saved. Attendance will treat these dates as non-instructional for the selected scope.",
      );
      await load();
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Calendar event could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  const branchName = (
    id: string | null,
  ) =>
    id
      ? branches.find(
          (branch) =>
            branch.id ===
            id,
        )?.name ??
        "Branch"
      : "Whole school";

  return (
    <main className="casa-shell min-h-screen bg-[#f2f2ef] text-[#0b0b0a]">
      <header className="border-b border-black bg-white px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-[1500px] flex-wrap items-end justify-between gap-5">
          <div>
            <p className="casa-kicker text-black/45">
              CASA / Calendar & Holidays
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-[-0.05em]">
              {schoolName}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-black/50">
              Calendar events sit above the normal attendance timetable. On a holiday, break or closure, students are not counted absent and check-in is blocked for the affected school or branch.
            </p>
          </div>
          <nav className="flex flex-wrap gap-3 text-sm">
            <Link className="casa-button" href={`/schools/${encodeURIComponent(slug)}/registry`}>
              Registry
            </Link>
            <Link className="casa-button" href={`/schools/${encodeURIComponent(slug)}/academic`}>
              Academic setup
            </Link>
            <Link className="casa-button" href={`/schools/${encodeURIComponent(slug)}/attendance`}>
              Attendance
            </Link>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-6 px-5 py-7 sm:px-8 xl:grid-cols-[0.75fr_1.25fr]">
        <form onSubmit={create} className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            New calendar event
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Mark non-instructional dates
          </h2>
          <div className="mt-5 grid gap-4">
            <label className="casa-label">
              <span>Type</span>
              <select
                className="casa-field"
                value={kind}
                onChange={(event) => setKind(event.target.value as EventRow["kind"])}
              >
                <option value="PUBLIC_HOLIDAY">Public holiday</option>
                <option value="SCHOOL_BREAK">School break</option>
                <option value="BRANCH_CLOSURE">Branch closure</option>
                <option value="SPECIAL_NON_INSTRUCTIONAL_DAY">Special non-instructional day</option>
              </select>
            </label>

            <label className="casa-label">
              <span>Title</span>
              <input className="casa-field" name="title" placeholder="Independence Day" required />
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="casa-label">
                <span>Starts</span>
                <input className="casa-field" type="date" name="startsOn" required />
              </label>
              <label className="casa-label">
                <span>Ends</span>
                <input className="casa-field" type="date" name="endsOn" required />
              </label>
            </div>

            {organizationAdmin ? (
              <label className="casa-label">
                <span>Scope</span>
                <select className="casa-field" name="branchId" required={kind === "BRANCH_CLOSURE"}>
                  <option value="">Whole school</option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.is_headquarters ? " · HQ" : ""}
                    </option>
                  ))}
                </select>
              </label>
            ) : branches.length === 1 ? (
              <label className="casa-label">
                <span>Scope</span>
                <span className="casa-field flex items-center bg-black/[0.025]">
                  {branches[0].name}
                  {branches[0].is_headquarters ? " · HQ" : ""}
                </span>
                <input type="hidden" name="branchId" value={branches[0].id} />
              </label>
            ) : (
              <label className="casa-label">
                <span>Scope</span>
                <select className="casa-field" name="branchId" required defaultValue="">
                  <option value="" disabled>
                    Select assigned campus
                  </option>
                  {branches.map((branch) => (
                    <option key={branch.id} value={branch.id}>
                      {branch.name}
                      {branch.is_headquarters ? " · HQ" : ""}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="casa-label">
              <span>Notes</span>
              <textarea className="casa-field min-h-24" name="notes" />
            </label>

            {kind === "BRANCH_CLOSURE" ? (
              <p className="text-xs leading-5 text-black/45">
                Branch Closure must target one campus. Other campuses remain instructional.
              </p>
            ) : null}

            <button
              className="casa-button-primary"
              disabled={busy || (!organizationAdmin && branches.length === 0)}
            >
              {busy ? "Saving…" : "Save calendar event"}
            </button>
          </div>

          {notice ? (
            <p className="mt-4 text-sm text-[#145a3b]">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-4 text-sm text-[#7e1d18]">
              {error}
            </p>
          ) : null}
        </form>

        <section className="border border-black bg-white">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">
              Calendar
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Non-instructional dates
            </h2>
            <p className="mt-2 text-xs text-black/45">
              Showing {range.startsOn} through {range.endsOn}.
            </p>
          </div>

          {events.length === 0 ? (
            <p className="p-5 text-sm text-black/45">
              No holiday, break or closure has been configured in this range.
            </p>
          ) : (
            events.map((event) => (
              <div
                key={event.id}
                className="grid gap-3 border-b border-black/15 p-5 last:border-b-0 md:grid-cols-[1fr_auto]"
              >
                <div>
                  <p className="font-semibold">
                    {event.title}
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    {event.starts_on} → {event.ends_on}
                  </p>
                  {event.notes ? (
                    <p className="mt-2 text-sm text-black/55">
                      {event.notes}
                    </p>
                  ) : null}
                </div>
                <div className="md:text-right">
                  <p className="font-mono text-[9px] uppercase tracking-[0.08em]">
                    {labels[event.kind]}
                  </p>
                  <p className="mt-1 text-xs text-black/45">
                    {branchName(event.branch_id)}
                  </p>
                </div>
              </div>
            ))
          )}
        </section>
      </div>
    </main>
  );
}
