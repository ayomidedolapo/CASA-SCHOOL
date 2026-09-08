"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type PolicyDay = {
  policyId?: string;
  weekday: number;
  checkInOpensAt: string;
  onTimeUntil: string;
  checkInClosesAt: string;
  normalDismissalAt: string;
  checkOutClosesAt: string;
};

type Policy = {
  id: string;
  name: string;
  isDefault: boolean;
  isActive: boolean;
  validFrom: string;
  validTo: string | null;
  schoolBusGraceMinutes: number;
  independentGraceMinutes: number;
  days: PolicyDay[];
};

type Student = {
  id: string;
  casaStudentId: string;
  admissionNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  classArmName: string | null;
  classLevelName: string | null;
};

type ArrivalAssignment = {
  id: string;
  arrival_method: "SCHOOL_BUS" | "INDEPENDENT";
  effective_from: string;
  effective_to: string | null;
  reason: string | null;
};

const weekdays = [
  "SUN",
  "MON",
  "TUE",
  "WED",
  "THU",
  "FRI",
  "SAT",
];

async function jsonOrThrow(
  response: Response,
) {
  const body =
    await response.json().catch(
      () => ({}),
    );

  if (!response.ok) {
    throw new Error(
      typeof body.message ===
        "string"
        ? body.message
        : "Request failed.",
    );
  }

  return body;
}

export default function TransportClient({
  slug,
  schoolName,
  schoolTimezone,
}: {
  slug: string;
  schoolName: string;
  schoolTimezone: string;
}) {
  const [policies, setPolicies] =
    useState<Policy[]>([]);
  const [busGrace, setBusGrace] =
    useState("0");
  const [
    independentGrace,
    setIndependentGrace,
  ] = useState("0");
  const [validFrom, setValidFrom] =
    useState(() => {
      const parts =
        new Intl.DateTimeFormat(
          "en-CA",
          {
            timeZone:
              schoolTimezone,
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          },
        ).formatToParts(
          new Date(),
        );
      const part =
        (type: string) =>
          parts.find(
            (item) =>
              item.type === type,
          )?.value ?? "";
      return `${part("year")}-${part("month")}-${part("day")}`;
    });
  const [policyBusy, setPolicyBusy] =
    useState(false);
  const [policyMessage, setPolicyMessage] =
    useState("");

  const [query, setQuery] =
    useState("");
  const [students, setStudents] =
    useState<Student[]>([]);
  const [searchBusy, setSearchBusy] =
    useState(false);
  const [
    selectedStudent,
    setSelectedStudent,
  ] = useState<Student | null>(null);
  const [
    arrivalHistory,
    setArrivalHistory,
  ] = useState<ArrivalAssignment[]>([]);
  const [
    arrivalMethod,
    setArrivalMethod,
  ] =
    useState<
      "SCHOOL_BUS" | "INDEPENDENT"
    >("INDEPENDENT");
  const [
    arrivalEffectiveFrom,
    setArrivalEffectiveFrom,
  ] = useState("");
  const [arrivalReason, setArrivalReason] =
    useState("");
  const [arrivalBusy, setArrivalBusy] =
    useState(false);
  const [
    arrivalMessage,
    setArrivalMessage,
  ] = useState("");

  const currentPolicy =
    useMemo(
      () =>
        policies.find(
          (policy) =>
            policy.isDefault &&
            policy.isActive,
        ) ??
        policies.find(
          (policy) =>
            policy.isActive,
        ) ??
        policies[0] ??
        null,
      [policies],
    );

  const fetchPolicies =
    useCallback(async () => {
      const body =
        await jsonOrThrow(
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/attendance/policies`,
            {
              cache: "no-store",
            },
          ),
        );

      return Array.isArray(
        body.policies,
      )
        ? body.policies as Policy[]
        : [];
    }, [slug]);

  const applyPolicies =
    useCallback(
      (next: Policy[]) => {
        setPolicies(next);

        const active =
          next.find(
            (policy) =>
              policy.isDefault &&
              policy.isActive,
          ) ??
          next.find(
            (policy) =>
              policy.isActive,
          ) ??
          next[0];

        if (active) {
          setBusGrace(
            String(
              active.schoolBusGraceMinutes,
            ),
          );
          setIndependentGrace(
            String(
              active.independentGraceMinutes,
            ),
          );
        }
      },
      [],
    );

  const loadPolicies =
    useCallback(async () => {
      const next =
        await fetchPolicies();

      applyPolicies(next);
    }, [
      applyPolicies,
      fetchPolicies,
    ]);

  useEffect(() => {
    let cancelled =
      false;

    void (async () => {
      try {
        const next =
          await fetchPolicies();

        if (cancelled) {
          return;
        }

        setPolicies(next);

        const active =
          next.find(
            (policy) =>
              policy.isDefault &&
              policy.isActive,
          ) ??
          next.find(
            (policy) =>
              policy.isActive,
          ) ??
          next[0];

        if (active) {
          setBusGrace(
            String(
              active.schoolBusGraceMinutes,
            ),
          );
          setIndependentGrace(
            String(
              active.independentGraceMinutes,
            ),
          );
        }
      } catch (error) {
        if (cancelled) {
          return;
        }

        setPolicyMessage(
          error instanceof Error
            ? error.message
            : "Could not load policy.",
        );
      }
    })();

    return () => {
      cancelled =
        true;
    };
  }, [
    applyPolicies,
    fetchPolicies,
  ]);

  async function saveGrace(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!currentPolicy) {
      setPolicyMessage(
        "Create an attendance policy before configuring transport grace.",
      );
      return;
    }

    setPolicyBusy(true);
    setPolicyMessage("");

    try {
      const bus =
        Number.parseInt(
          busGrace,
          10,
        );
      const independent =
        Number.parseInt(
          independentGrace,
          10,
        );

      if (
        !Number.isInteger(bus) ||
        !Number.isInteger(independent) ||
        bus < 0 ||
        bus > 240 ||
        independent < 0 ||
        independent > 240
      ) {
        throw new Error(
          "Grace must be a whole number from 0 to 240 minutes.",
        );
      }

      await jsonOrThrow(
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/attendance/policies`,
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              name:
                `${currentPolicy.name} / transport revision`,
              validFrom,
              validTo: null,
              isDefault: true,
              schoolBusGraceMinutes:
                bus,
              independentGraceMinutes:
                independent,
              days:
                currentPolicy.days.map(
                  (day) => ({
                    weekday:
                      day.weekday,
                    checkInOpensAt:
                      day.checkInOpensAt,
                    onTimeUntil:
                      day.onTimeUntil,
                    checkInClosesAt:
                      day.checkInClosesAt,
                    normalDismissalAt:
                      day.normalDismissalAt,
                    checkOutClosesAt:
                      day.checkOutClosesAt,
                  }),
                ),
            }),
          },
        ),
      );

      setPolicyMessage(
        "New policy version created. Historical attendance remains unchanged.",
      );
      await loadPolicies();
    } catch (error) {
      setPolicyMessage(
        error instanceof Error
          ? error.message
          : "Policy update failed.",
      );
    } finally {
      setPolicyBusy(false);
    }
  }

  async function searchStudents(
    event?: FormEvent,
  ) {
    event?.preventDefault();
    setSearchBusy(true);

    try {
      const body =
        await jsonOrThrow(
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/registry/students?q=${encodeURIComponent(
              query.trim(),
            )}`,
            {
              cache: "no-store",
            },
          ),
        );

      setStudents(
        Array.isArray(body.students)
          ? body.students
          : [],
      );
    } catch (error) {
      setArrivalMessage(
        error instanceof Error
          ? error.message
          : "Student search failed.",
      );
    } finally {
      setSearchBusy(false);
    }
  }

  async function selectStudent(
    student: Student,
  ) {
    setSelectedStudent(student);
    setArrivalMessage("");

    try {
      const body =
        await jsonOrThrow(
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/registry/students/${encodeURIComponent(
              student.id,
            )}/arrival-method`,
            {
              cache: "no-store",
            },
          ),
        );

      const history =
        Array.isArray(body.history)
          ? body.history as ArrivalAssignment[]
          : [];
      const current =
        body.current as
          | ArrivalAssignment
          | null;

      setArrivalHistory(history);

      if (current) {
        setArrivalMethod(
          current.arrival_method,
        );
        setArrivalEffectiveFrom(
          current.effective_from,
        );
      }
    } catch (error) {
      setArrivalMessage(
        error instanceof Error
          ? error.message
          : "Could not load arrival method.",
      );
    }
  }

  async function saveArrival(
    event: FormEvent,
  ) {
    event.preventDefault();

    if (!selectedStudent) {
      return;
    }

    setArrivalBusy(true);
    setArrivalMessage("");

    try {
      const body =
        await jsonOrThrow(
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/registry/students/${encodeURIComponent(
              selectedStudent.id,
            )}/arrival-method`,
            {
              method: "PATCH",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                arrivalMethod,
                effectiveFrom:
                  arrivalEffectiveFrom,
                reason:
                  arrivalReason.trim() ||
                  null,
              }),
            },
          ),
        );

      setArrivalMessage(
        "Arrival method assignment saved.",
      );
      setArrivalReason("");

      const assignment =
        body.assignment as
          | ArrivalAssignment
          | undefined;

      if (assignment) {
        setArrivalHistory(
          (previous) => [
            assignment,
            ...previous.filter(
              (item) =>
                item.id !==
                assignment.id,
            ),
          ],
        );
      }

      await selectStudent(
        selectedStudent,
      );
    } catch (error) {
      setArrivalMessage(
        error instanceof Error
          ? error.message
          : "Arrival assignment failed.",
      );
    } finally {
      setArrivalBusy(false);
    }
  }

  return (
    <div className="grid w-full lg:grid-cols-[0.9fr_1.1fr]">
      <section className="border-b border-black p-5 sm:p-8 lg:border-b-0 lg:border-r">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]">
          01 / Policy
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
          Exact grace windows
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-black/60">
          {schoolName}. Values are explicit. There are no hidden transport defaults.
        </p>

        <form
          className="mt-8 grid gap-6"
          onSubmit={saveGrace}
        >
          <label className="grid gap-2 border-t border-black pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
              School bus grace / minutes
            </span>
            <input
              className="border-0 border-b border-black bg-transparent px-0 py-3 text-4xl font-semibold outline-none"
              inputMode="numeric"
              max="240"
              min="0"
              onChange={(event) =>
                setBusGrace(
                  event.target.value,
                )
              }
              required
              type="number"
              value={busGrace}
            />
          </label>

          <label className="grid gap-2 border-t border-black pt-4">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Independent grace / minutes
            </span>
            <input
              className="border-0 border-b border-black bg-transparent px-0 py-3 text-4xl font-semibold outline-none"
              inputMode="numeric"
              max="240"
              min="0"
              onChange={(event) =>
                setIndependentGrace(
                  event.target.value,
                )
              }
              required
              type="number"
              value={
                independentGrace
              }
            />
          </label>

          <label className="grid gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Version effective from
            </span>
            <input
              className="border border-black bg-transparent px-3 py-3"
              onChange={(event) =>
                setValidFrom(
                  event.target.value,
                )
              }
              required
              type="date"
              value={validFrom}
            />
          </label>

          <button
            className="border border-black bg-black px-5 py-4 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-[#f2f2ef] disabled:opacity-40"
            disabled={
              policyBusy ||
              !currentPolicy
            }
            type="submit"
          >
            {policyBusy
              ? "Saving..."
              : "Create policy version"}
          </button>
        </form>

        {policyMessage ? (
          <p className="mt-4 border-l-2 border-black pl-3 text-sm leading-6">
            {policyMessage}
          </p>
        ) : null}

        <div className="mt-10 border-t border-black pt-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em]">
            Instructional clock preserved
          </p>
          <div className="mt-4 grid gap-2">
            {currentPolicy?.days.map(
              (day) => (
                <div
                  className="grid grid-cols-[52px_1fr] gap-3 border-b border-black/20 py-2 text-xs"
                  key={day.weekday}
                >
                  <span className="font-mono">
                    {weekdays[
                      day.weekday
                    ]}
                  </span>
                  <span>
                    Official on-time boundary{" "}
                    {day.onTimeUntil.slice(
                      0,
                      5,
                    )}{" "}
                    / close{" "}
                    {day.checkInClosesAt.slice(
                      0,
                      5,
                    )}
                  </span>
                </div>
              ),
            )}
          </div>
        </div>
      </section>

      <section className="p-5 sm:p-8">
        <p className="font-mono text-[10px] uppercase tracking-[0.2em]">
          02 / Student assignment
        </p>
        <h2 className="mt-4 text-2xl font-semibold tracking-[-0.04em]">
          Administrative arrival method
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-6 text-black/60">
          Students do not choose Bus or Independent at the scanner. CASA resolves the effective assignment server-side.
        </p>

        <form
          className="mt-8 flex border border-black"
          onSubmit={searchStudents}
        >
          <input
            className="min-w-0 flex-1 bg-transparent px-4 py-3 outline-none"
            onChange={(event) =>
              setQuery(
                event.target.value,
              )
            }
            placeholder="Name, CASA ID or admission number"
            value={query}
          />
          <button
            className="border-l border-black bg-black px-5 font-mono text-[10px] uppercase tracking-[0.16em] text-[#f2f2ef]"
            disabled={searchBusy}
            type="submit"
          >
            Search
          </button>
        </form>

        <div className="mt-4 grid max-h-72 overflow-auto border-t border-black">
          {students.map(
            (student) => (
              <button
                className="grid grid-cols-[1fr_auto] gap-3 border-b border-black/25 py-3 text-left"
                key={student.id}
                onClick={() =>
                  void selectStudent(
                    student,
                  )
                }
                type="button"
              >
                <span>
                  <strong className="block text-sm">
                    {student.firstName}{" "}
                    {student.lastName}
                  </strong>
                  <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.1em] text-black/55">
                    {student.casaStudentId}
                    {" / "}
                    {[
                      student.classLevelName,
                      student.classArmName,
                    ]
                      .filter(Boolean)
                      .join(" ") ||
                      "No active class"}
                  </span>
                </span>
                <span className="font-mono text-[10px] uppercase">
                  Select
                </span>
              </button>
            ),
          )}
        </div>

        {selectedStudent ? (
          <form
            className="mt-8 border-t border-black pt-5"
            onSubmit={saveArrival}
          >
            <p className="font-mono text-[10px] uppercase tracking-[0.16em]">
              Selected /{" "}
              {selectedStudent.casaStudentId}
            </p>
            <h3 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
              {selectedStudent.firstName}{" "}
              {selectedStudent.lastName}
            </h3>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Arrival method
                </span>
                <select
                  className="border border-black bg-[#f2f2ef] px-3 py-3"
                  onChange={(event) =>
                    setArrivalMethod(
                      event.target.value as
                        | "SCHOOL_BUS"
                        | "INDEPENDENT",
                    )
                  }
                  value={arrivalMethod}
                >
                  <option value="INDEPENDENT">
                    Independent
                  </option>
                  <option value="SCHOOL_BUS">
                    School bus
                  </option>
                </select>
              </label>

              <label className="grid gap-2">
                <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                  Effective from
                </span>
                <input
                  className="border border-black bg-transparent px-3 py-3"
                  onChange={(event) =>
                    setArrivalEffectiveFrom(
                      event.target.value,
                    )
                  }
                  required
                  type="date"
                  value={
                    arrivalEffectiveFrom
                  }
                />
              </label>
            </div>

            <label className="mt-4 grid gap-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.14em]">
                Reason / optional
              </span>
              <input
                className="border border-black bg-transparent px-3 py-3"
                maxLength={240}
                onChange={(event) =>
                  setArrivalReason(
                    event.target.value,
                  )
                }
                placeholder="e.g. Parent confirmed school-bus service"
                value={arrivalReason}
              />
            </label>

            <button
              className="mt-4 w-full border border-black bg-black px-5 py-4 text-left font-mono text-[10px] uppercase tracking-[0.18em] text-[#f2f2ef] disabled:opacity-40"
              disabled={arrivalBusy}
              type="submit"
            >
              {arrivalBusy
                ? "Saving..."
                : "Save effective-dated assignment"}
            </button>

            {arrivalMessage ? (
              <p className="mt-4 border-l-2 border-black pl-3 text-sm">
                {arrivalMessage}
              </p>
            ) : null}

            <div className="mt-8 border-t border-black pt-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em]">
                Assignment history
              </p>
              {arrivalHistory.map(
                (assignment) => (
                  <div
                    className="mt-3 grid grid-cols-[1fr_auto] gap-4 border-b border-black/20 pb-3 text-xs"
                    key={assignment.id}
                  >
                    <span>
                      {assignment.arrival_method ===
                      "SCHOOL_BUS"
                        ? "School bus"
                        : "Independent"}
                      <span className="mt-1 block text-black/55">
                        From{" "}
                        {
                          assignment.effective_from
                        }
                        {assignment.effective_to
                          ? ` to ${assignment.effective_to}`
                          : " onward"}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] uppercase">
                      {assignment.effective_to
                        ? "Historic"
                        : "Current"}
                    </span>
                  </div>
                ),
              )}
            </div>
          </form>
        ) : null}
      </section>
    </div>
  );
}
