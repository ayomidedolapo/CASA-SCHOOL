"use client";

import {
  type FormEvent,
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
  participant_count?: number;
};

type StudentOption = {
  id: string;
  casa_student_id: string;
  admission_number: string | null;
  full_name: string;
};

type RosterRow = {
  participant_id: string;
  student_id: string | null;
  full_name: string;
  is_guest: boolean;
  guest_guardian_name: string | null;
  attendance_status:
    | "PRESENT"
    | "LATE"
    | "ABSENT"
    | null;
  checked_in_at: string | null;
  checked_out_at: string | null;
};

export default function SummerClient(
  {
    slug,
    branches,
  }: {
    slug: string;
    branches: Branch[];
  },
) {
  const [
    branchId,
    setBranchId,
  ] =
    useState(
      branches[0]?.id ??
        "",
    );
  const [
    programmes,
    setProgrammes,
  ] =
    useState<Programme[]>(
      [],
    );
  const [
    programmeId,
    setProgrammeId,
  ] =
    useState("");
  const [
    roster,
    setRoster,
  ] =
    useState<RosterRow[]>(
      [],
    );
  const [
    studentOptions,
    setStudentOptions,
  ] =
    useState<StudentOption[]>(
      [],
    );
  const [
    selectedStudentId,
    setSelectedStudentId,
  ] =
    useState("");
  const [
    busy,
    setBusy,
  ] =
    useState(false);
  const [
    notice,
    setNotice,
  ] =
    useState("");
  const [
    error,
    setError,
  ] =
    useState("");

  const base =
    `/api/schools/${encodeURIComponent(
      slug,
    )}/summer`;

  const load =
    useCallback(
      async (
        targetProgrammeId =
          programmeId,
      ) => {
        if (
          !branchId
        ) {
          setProgrammes([]);
          setRoster([]);
          setStudentOptions([]);
          return;
        }

        const params =
          new URLSearchParams({
            branchId,
          });

        if (
          targetProgrammeId
        ) {
          params.set(
            "programmeId",
            targetProgrammeId,
          );
        }

        const response =
          await fetch(
            `${base}?${params.toString()}`,
            {
              cache:
                "no-store",
              credentials:
                "same-origin",
            },
          );
        const body =
          await response.json()
            .catch(
              () =>
                ({}),
            ) as {
              message?: string;
              programmes?: Programme[];
              roster?: RosterRow[];
              studentOptions?: StudentOption[];
            };

        if (
          !response.ok
        ) {
          throw new Error(
            body.message ??
              "Summer programme could not be loaded.",
          );
        }

        const nextProgrammes =
          body.programmes ??
          [];
        setProgrammes(
          nextProgrammes,
        );
        setStudentOptions(
          body.studentOptions ??
            [],
        );

        const nextProgrammeId =
          targetProgrammeId &&
          nextProgrammes.some(
            (
              programme,
            ) =>
              programme.id ===
              targetProgrammeId,
          )
            ? targetProgrammeId
            : nextProgrammes[0]
                ?.id ??
              "";

        if (
          nextProgrammeId !==
            programmeId
        ) {
          setProgrammeId(
            nextProgrammeId,
          );
        }

        if (
          nextProgrammeId ===
            targetProgrammeId
        ) {
          setRoster(
            body.roster ??
              [],
          );
        } else if (
          nextProgrammeId
        ) {
          const nextParams =
            new URLSearchParams({
              branchId,
              programmeId:
                nextProgrammeId,
            });
          const nextResponse =
            await fetch(
              `${base}?${nextParams.toString()}`,
              {
                cache:
                  "no-store",
                credentials:
                  "same-origin",
              },
            );
          const nextBody =
            await nextResponse.json()
              .catch(
                () =>
                  ({}),
              ) as {
                roster?: RosterRow[];
              };
          setRoster(
            nextBody.roster ??
              [],
          );
        } else {
          setRoster([]);
        }
      },
      [
        base,
        branchId,
        programmeId,
      ],
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void load()
              .catch(
                (
                  caught,
                ) =>
                  setError(
                    caught instanceof
                      Error
                      ? caught.message
                      : "Summer programme could not be loaded.",
                  ),
              );
          },
          0,
        );

      return () => {
        window.clearTimeout(
          timer,
        );
      };
    },
    [
      branchId,
      load,
    ],
  );

  const selectedProgramme =
    useMemo(
      () =>
        programmes.find(
          (
            programme,
          ) =>
            programme.id ===
            programmeId,
        ) ??
        null,
      [
        programmes,
        programmeId,
      ],
    );

  async function action(
    payload:
      Record<
        string,
        unknown
      >,
    success:
      string,
  ) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response =
        await fetch(
          base,
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
                branchId,
                ...payload,
              }),
          },
        );
      const body =
        await response.json()
          .catch(
            () =>
              ({}),
          ) as {
            message?: string;
            result?: {
              id?: string;
            };
          };

      if (
        !response.ok
      ) {
        throw new Error(
          body.message ??
            "Summer action failed.",
        );
      }

      setNotice(
        success,
      );
      await load(
        String(
          payload.programmeId ??
            body.result?.id ??
            programmeId,
        ),
      );
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Summer action failed.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function createProgramme(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form =
      new FormData(
        event.currentTarget,
      );

    await action(
      {
        action:
          "CREATE_PROGRAMME",
        name:
          form.get(
            "name",
          ),
        startsOn:
          form.get(
            "startsOn",
          ),
        endsOn:
          form.get(
            "endsOn",
          ),
        operatingDays:
          [
            1,
            2,
            3,
            4,
            5,
          ],
        checkInOpens:
          form.get(
            "checkInOpens",
          ),
        expectedArrival:
          form.get(
            "expectedArrival",
          ),
        checkInCloses:
          form.get(
            "checkInCloses",
          ),
        dismissalTime:
          form.get(
            "dismissalTime",
          ),
        checkoutCloses:
          form.get(
            "checkoutCloses",
          ),
      },
      "Summer programme created.",
    );
  }

  return (
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

      <section className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/45">
            Summer operations
          </p>
          <p className="mt-2 text-xs leading-5 text-black/50">
            Admins and School Technicians register the Summer roster and attendance. Teachers do not need a special Summer assignment.
          </p>

          <label className="casa-label mt-5">
            <span>Campus</span>
            <select
              className="casa-field"
              value={
                branchId
              }
              onChange={
                (
                  event,
                ) => {
                  setBranchId(
                    event.target.value,
                  );
                  setProgrammeId(
                    "",
                  );
                }
              }
            >
              {branches.map(
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
                  </option>
                ),
              )}
            </select>
          </label>

          <label className="casa-label mt-4">
            <span>Summer programme</span>
            <select
              className="casa-field"
              value={
                programmeId
              }
              onChange={
                (
                  event,
                ) => {
                  const value =
                    event.target.value;
                  setProgrammeId(
                    value,
                  );
                  void load(
                    value,
                  );
                }
              }
            >
              <option value="">
                Select programme
              </option>
              {programmes.map(
                (
                  programme,
                ) => (
                  <option
                    key={
                      programme.id
                    }
                    value={
                      programme.id
                    }
                  >
                    {programme.name}
                  </option>
                ),
              )}
            </select>
          </label>

          <form
            className="mt-7 border-t border-black pt-5"
            onSubmit={
              createProgramme
            }
          >
            <p className="font-semibold">
              Create Summer programme
            </p>
            <label className="casa-label mt-4">
              <span>Name</span>
              <input
                className="casa-field"
                name="name"
                required
                placeholder="2026 Summer School"
              />
            </label>
            <div className="mt-4 grid grid-cols-2 gap-3">
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
            {[
              [
                "checkInOpens",
                "Check-in opens",
                "08:00",
              ],
              [
                "expectedArrival",
                "Expected arrival",
                "09:00",
              ],
              [
                "checkInCloses",
                "Check-in closes",
                "10:00",
              ],
              [
                "dismissalTime",
                "Dismissal",
                "14:00",
              ],
              [
                "checkoutCloses",
                "Checkout closes",
                "16:00",
              ],
            ].map(
              (
                [
                  name,
                  label,
                  value,
                ],
              ) => (
                <label
                  key={
                    name
                  }
                  className="casa-label mt-3"
                >
                  <span>
                    {label}
                  </span>
                  <input
                    className="casa-field"
                    name={
                      name
                    }
                    type="time"
                    defaultValue={
                      value
                    }
                    required
                  />
                </label>
              ),
            )}
            <button
              className="casa-button mt-5 w-full"
              disabled={
                busy ||
                !branchId
              }
            >
              Create programme
            </button>
          </form>
        </aside>

        <div className="space-y-6">
          <section className="border border-black bg-white p-5">
            <p className="casa-kicker text-black/45">
              Summer roster
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              {selectedProgramme
                ?.name ??
                "Select a programme"}
            </h2>

            {programmeId ? (
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div>
                  <p className="font-semibold">
                    Add enrolled student
                  </p>
                  <div className="mt-3 flex gap-2">
                    <select
                      className="casa-field"
                      value={
                        selectedStudentId
                      }
                      onChange={
                        (
                          event,
                        ) =>
                          setSelectedStudentId(
                            event.target.value,
                          )
                      }
                    >
                      <option value="">
                        Select student
                      </option>
                      {studentOptions.map(
                        (
                          student,
                        ) => (
                          <option
                            key={
                              student.id
                            }
                            value={
                              student.id
                            }
                          >
                            {student.full_name} · {student.casa_student_id}
                          </option>
                        ),
                      )}
                    </select>
                    <button
                      type="button"
                      className="casa-button"
                      disabled={
                        busy ||
                        !selectedStudentId
                      }
                      onClick={() =>
                        void action(
                          {
                            action:
                              "ADD_STUDENT",
                            programmeId,
                            studentId:
                              selectedStudentId,
                          },
                          "Student added to Summer.",
                        )
                      }
                    >
                      Add
                    </button>
                  </div>
                </div>

                <form
                  onSubmit={
                    (
                      event,
                    ) => {
                      event.preventDefault();
                      const form =
                        new FormData(
                          event.currentTarget,
                        );
                      void action(
                        {
                          action:
                            "ADD_GUEST",
                          programmeId,
                          fullName:
                            form.get(
                              "fullName",
                            ),
                          sex:
                            form.get(
                              "sex",
                            ) ||
                            null,
                          guardianName:
                            form.get(
                              "guardianName",
                            ),
                          guardianPhone:
                            form.get(
                              "guardianPhone",
                            ) ||
                            null,
                          guardianEmail:
                            form.get(
                              "guardianEmail",
                            ) ||
                            null,
                          notificationsEnabled:
                            true,
                        },
                        "Guest student registered for Summer.",
                      );
                    }
                  }
                >
                  <p className="font-semibold">
                    Register guest student
                  </p>
                  <label className="casa-label mt-3">
                    <span>Student name</span>
                    <input className="casa-field" name="fullName" required />
                  </label>
                  <label className="casa-label mt-3">
                    <span>Sex / optional</span>
                    <input className="casa-field" name="sex" />
                  </label>
                  <label className="casa-label mt-3">
                    <span>Guardian name</span>
                    <input className="casa-field" name="guardianName" required />
                  </label>
                  <label className="casa-label mt-3">
                    <span>Guardian phone / optional</span>
                    <input className="casa-field" name="guardianPhone" />
                  </label>
                  <label className="casa-label mt-3">
                    <span>Guardian email / optional</span>
                    <input className="casa-field" type="email" name="guardianEmail" />
                  </label>
                  <button className="casa-button mt-4" disabled={busy}>
                    Register guest
                  </button>
                </form>
              </div>
            ) : (
              <p className="mt-4 text-sm text-black/45">
                Choose or create a Summer programme first.
              </p>
            )}
          </section>

          <section className="border border-black bg-white">
            <div className="border-b border-black p-5">
              <p className="casa-kicker text-black/45">
                Today
              </p>
              <h2 className="mt-2 text-2xl font-semibold">
                Summer attendance
              </h2>
            </div>
            {roster.length ===
            0 ? (
              <p className="p-5 text-sm text-black/45">
                No Summer participants yet.
              </p>
            ) : (
              <div className="divide-y divide-black/15">
                {roster.map(
                  (
                    participant,
                  ) => (
                    <article
                      key={
                        participant.participant_id
                      }
                      className="grid gap-3 p-5 md:grid-cols-[1fr_auto] md:items-center"
                    >
                      <div>
                        <p className="font-semibold">
                          {participant.full_name}
                        </p>
                        <p className="mt-1 text-xs text-black/45">
                          {participant.is_guest
                            ? "Guest student"
                            : "Enrolled CASA student"}
                          {" · "}
                          {participant.attendance_status ??
                            "Not marked"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {(
                          [
                            "PRESENT",
                            "LATE",
                            "ABSENT",
                          ] as const
                        ).map(
                          (
                            status,
                          ) => (
                            <button
                              key={
                                status
                              }
                              type="button"
                              className="casa-button"
                              disabled={
                                busy ||
                                !programmeId
                              }
                              onClick={() =>
                                void action(
                                  {
                                    action:
                                      "MARK_ATTENDANCE",
                                    programmeId,
                                    participantId:
                                      participant.participant_id,
                                    status,
                                    note:
                                      null,
                                  },
                                  `${participant.full_name} marked ${status.toLowerCase()}.`,
                                )
                              }
                            >
                              {status}
                            </button>
                          ),
                        )}
                      </div>
                    </article>
                  ),
                )}
              </div>
            )}
          </section>
        </div>
      </section>
    </div>
  );
}
