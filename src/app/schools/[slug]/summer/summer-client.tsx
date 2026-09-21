"use client";

import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

type Branch = {
  id: string;
  name: string;
  isHeadquarters: boolean;
};

type Programme = {
  id: string;
  name: string;
  starts_on: string;
  ends_on: string;
  status: string;
  participant_count: number;
  teacher_count: number;
};

type StudentOption = {
  id: string;
  casa_student_id: string;
  admission_number: string | null;
  full_name: string;
};

type Participant = {
  participant_id: string;
  full_name: string;
  is_guest: boolean;
  attendance_status: string | null;
  guest_guardian_name: string | null;
};

const days = [
  { v: 1, l: "Mon" },
  { v: 2, l: "Tue" },
  { v: 3, l: "Wed" },
  { v: 4, l: "Thu" },
  { v: 5, l: "Fri" },
  { v: 6, l: "Sat" },
  { v: 0, l: "Sun" },
];

export default function SummerClient({
  slug,
  branches,
}: {
  slug: string;
  branches: Branch[];
}) {
  const [branchId, setBranchId] = useState(branches[0]?.id ?? "");
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [programmeId, setProgrammeId] = useState("");
  const [roster, setRoster] = useState<Participant[]>([]);
  const [studentOptions, setStudentOptions] = useState<StudentOption[]>([]);
  const [studentId, setStudentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const endpoint = `/api/schools/${encodeURIComponent(slug)}/summer`;

  const fetchSummer = useCallback(async () => {
    if (!branchId) {
      return {
        programmes: [] as Programme[],
        roster: [] as Participant[],
        studentOptions: [] as StudentOption[],
      };
    }

    const query = new URLSearchParams({ branchId });
    if (programmeId) {
      query.set("programmeId", programmeId);
    }

    const response = await fetch(`${endpoint}?${query}`, {
      cache: "no-store",
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(body.message ?? "Summer could not be loaded.");
    }

    return {
      programmes: (body.programmes ?? []) as Programme[],
      roster: (body.roster ?? []) as Participant[],
      studentOptions: (body.studentOptions ?? []) as StudentOption[],
    };
  }, [branchId, endpoint, programmeId]);

  const load = useCallback(async () => {
    const next = await fetchSummer();
    setProgrammes(next.programmes);
    setRoster(next.roster);
    setStudentOptions(next.studentOptions);
  }, [fetchSummer]);

  useEffect(() => {
    let active = true;
    void fetchSummer()
      .then((next) => {
        if (!active) {
          return;
        }
        setProgrammes(next.programmes);
        setRoster(next.roster);
        setStudentOptions(next.studentOptions);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error ? cause.message : "Summer could not be loaded.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, [fetchSummer]);

  async function post(body: unknown) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const responseBody = await response.json();
      if (!response.ok) {
        throw new Error(responseBody.message ?? "Summer action failed.");
      }
      setMessage("Saved.");
      await load();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Summer action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const operatingDays = days
      .filter((day) => form.get(`day-${day.v}`) === "on")
      .map((day) => day.v);

    await post({
      action: "CREATE_PROGRAMME",
      branchId,
      name: form.get("name"),
      startsOn: form.get("startsOn"),
      endsOn: form.get("endsOn"),
      operatingDays,
      checkInOpens: form.get("checkInOpens"),
      expectedArrival: form.get("expectedArrival"),
      checkInCloses: form.get("checkInCloses"),
      dismissalTime: form.get("dismissalTime"),
      checkoutCloses: form.get("checkoutCloses"),
    });
  }

  async function addGuest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    await post({
      action: "ADD_GUEST",
      branchId,
      programmeId: selected.id,
      fullName: form.get("guestFullName"),
      sex: String(form.get("guestSex") ?? "").trim() || null,
      guardianName: form.get("guardianName"),
      guardianPhone: String(form.get("guardianPhone") ?? "").trim() || null,
      guardianEmail: String(form.get("guardianEmail") ?? "").trim() || null,
      notificationsEnabled: form.get("notificationsEnabled") === "on",
    });
    event.currentTarget.reset();
  }

  const selected = useMemo(
    () => programmes.find((programme) => programme.id === programmeId) ?? null,
    [programmes, programmeId],
  );

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
      {error && (
        <div className="mb-4 border border-red-800 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}
      {message && (
        <div className="mb-4 border border-black bg-white p-3 text-sm">
          {message}
        </div>
      )}

      <section className="mb-6 border border-black bg-white p-5 sm:p-6">
        <p className="casa-kicker text-black/40">
          How Summer registration works
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div>
            <strong className="text-sm">1 Â· Create the programme</strong>
            <p className="mt-1 text-xs leading-5 text-black/50">
              Choose the campus, Summer dates, operating days and attendance times.
            </p>
          </div>
          <div>
            <strong className="text-sm">2 Â· Register participants</strong>
            <p className="mt-1 text-xs leading-5 text-black/50">
              Add existing CASA students or Summer-only guests. Summer registration does not change a normal class enrollment or issue a new ID card.
            </p>
          </div>
          <div>
            <strong className="text-sm">3 Â· Run Summer attendance</strong>
            <p className="mt-1 text-xs leading-5 text-black/50">
              Authorized campus staff mark attendance for the selected programme. Card scanning remains optional.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[420px_1fr]">
        <aside className="space-y-5">
          <section className="border border-black bg-white p-5">
            <p className="casa-kicker text-black/40">Campus</p>
            <select
              className="casa-field mt-3"
              value={branchId}
              onChange={(event) => {
                setBranchId(event.target.value);
                setProgrammeId("");
              }}
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                  {branch.isHeadquarters ? " · HQ" : ""}
                </option>
              ))}
            </select>
            <p className="mt-3 text-xs text-black/50">
              No terminal is required. This workspace is scoped to the campus
              you can operate.
            </p>
          </section>

          <form
            onSubmit={create}
            className="border border-black bg-white p-5"
          >
            <p className="casa-kicker text-black/40">New Summer programme</p>
            <h2 className="mt-2 text-xl font-semibold">
              Set dates and attendance times
            </h2>
            <div className="mt-4 grid gap-3">
              <input
                className="casa-field"
                name="name"
                placeholder="2026 Summer Lessons"
                required
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="casa-label">
                  <span>Starts</span>
                  <input
                    className="casa-field"
                    type="date"
                    name="startsOn"
                    required
                  />
                </label>
                <label className="casa-label">
                  <span>Ends</span>
                  <input
                    className="casa-field"
                    type="date"
                    name="endsOn"
                    required
                  />
                </label>
              </div>

              <div>
                <span className="casa-label">Operating days</span>
                <div className="mt-2 flex flex-wrap gap-2">
                  {days.map((day) => (
                    <label
                      key={day.v}
                      className="border border-black/20 px-2 py-1 text-xs"
                    >
                      <input
                        className="mr-1"
                        type="checkbox"
                        name={`day-${day.v}`}
                        defaultChecked={day.v >= 1 && day.v <= 5}
                      />
                      {day.l}
                    </label>
                  ))}
                </div>
              </div>

              {[
                ["checkInOpens", "Check-in opens"],
                ["expectedArrival", "Expected arrival"],
                ["checkInCloses", "Check-in closes"],
                ["dismissalTime", "Dismissal"],
                ["checkoutCloses", "Checkout closes"],
              ].map(([name, label]) => (
                <label key={name} className="casa-label">
                  <span>{label}</span>
                  <input
                    className="casa-field"
                    type="time"
                    name={name}
                    required
                  />
                </label>
              ))}
            </div>

            <button
              disabled={busy}
              className="casa-button-primary mt-4"
            >
              Create Summer programme
            </button>
          </form>
        </aside>

        <section className="border border-black bg-white">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">Programmes</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {programmes.map((programme) => (
                <button
                  key={programme.id}
                  type="button"
                  onClick={() => setProgrammeId(programme.id)}
                  className={`border px-3 py-2 text-sm ${
                    programmeId === programme.id
                      ? "border-black bg-black text-white"
                      : "border-black/20"
                  }`}
                >
                  {programme.name} · {programme.participant_count} participants
                </button>
              ))}
            </div>
          </div>

          {selected ? (
            <>
              <div className="border-b border-black/15 p-5">
                <h2 className="text-2xl font-semibold">{selected.name}</h2>
                <p className="mt-1 text-sm text-black/50">
                  {selected.starts_on} → {selected.ends_on} · {selected.status}
                </p>
                <p className="mt-2 text-xs text-black/50">
                  Teachers or authorized campus staff mark attendance here.
                  Terminal/card scanning is optional, never required.
                </p>
              </div>

              <div className="grid gap-4 border-b border-black/15 p-5 lg:grid-cols-2">
                <div className="border border-black/15 p-4">
                  <p className="casa-kicker text-black/40">Register school student</p>
                  <div className="mt-3 flex gap-2">
                    <select className="casa-field" value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                      <option value="">Choose student</option>
                      {studentOptions.map((student) => (
                        <option key={student.id} value={student.id}>
                          {student.full_name} · {student.casa_student_id}
                        </option>
                      ))}
                    </select>
                    <button type="button" disabled={busy || !studentId} className="casa-button-primary shrink-0" onClick={() => void post({ action: "ADD_STUDENT", branchId, programmeId: selected.id, studentId })}>
                      Add
                    </button>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-black/45">Only active students currently enrolled in this campus are listed. Adding them here registers them for this Summer programme only; their normal class/session enrollment and permanent ID card are unchanged.</p>
                </div>

                <form onSubmit={addGuest} className="border border-black/15 p-4">
                  <p className="casa-kicker text-black/40">Register Summer-only guest</p>
                  <p className="mt-2 text-xs leading-5 text-black/45">
                    Use this for a child attending Summer who is not in the school registry. This does not create a normal academic enrollment or ID card.
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <input className="casa-field sm:col-span-2" name="guestFullName" placeholder="Student full name" required />
                    <select className="casa-field" name="guestSex" defaultValue=""><option value="">Sex (optional)</option><option value="F">Female</option><option value="M">Male</option></select>
                    <input className="casa-field" name="guardianName" placeholder="Guardian name" required />
                    <input className="casa-field" name="guardianPhone" placeholder="Guardian phone" />
                    <input className="casa-field" name="guardianEmail" type="email" placeholder="Guardian email" />
                  </div>
                  <label className="mt-3 flex items-center gap-2 text-xs"><input type="checkbox" name="notificationsEnabled" defaultChecked /> Guardian notifications enabled</label>
                  <button disabled={busy} className="casa-button-primary mt-3">Add guest</button>
                </form>
              </div>

              <div className="divide-y divide-black/15">
                {roster.length === 0 ? (
                  <p className="p-6 text-sm text-black/45">
                    No Summer participants yet. Add an existing campus student or register a guest above.
                  </p>
                ) : (
                  roster.map((participant) => (
                    <div
                      key={participant.participant_id}
                      className="grid gap-3 p-4 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-semibold">
                          {participant.full_name}
                          {participant.is_guest ? " · Guest" : ""}
                        </p>
                        <p className="text-xs text-black/45">
                          {participant.attendance_status ?? "Not marked"}
                        </p>
                      </div>

                      <div className="flex gap-2">
                        {(["PRESENT", "LATE", "ABSENT"] as const).map(
                          (status) => (
                            <button
                              disabled={busy}
                              key={status}
                              onClick={() =>
                                void post({
                                  action: "MARK_ATTENDANCE",
                                  branchId,
                                  programmeId: selected.id,
                                  participantId: participant.participant_id,
                                  status,
                                  note: null,
                                })
                              }
                              className="border border-black px-3 py-2 text-xs"
                            >
                              {status[0] + status.slice(1).toLowerCase()}
                            </button>
                          ),
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          ) : (
            <p className="p-8 text-sm text-black/45">
              Create or select a Summer programme.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
