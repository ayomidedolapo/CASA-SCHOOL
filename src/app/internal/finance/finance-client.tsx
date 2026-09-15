"use client";

import {
  FormEvent,
  useState,
} from "react";
import {
  useRouter,
} from "next/navigation";

type School = {
  id: string;
  name: string;
  slug: string;
  status: string;
  student_count: number;
  current_session_name:
    | string
    | null;
  current_term_name:
    | string
    | null;
  session_term_count: number;
};

type Branch = {
  id: string;
  school_id: string;
  name: string;
  status: string;
  student_count: number;
  enrolled_count: number;
};

type Price = {
  id: string;
  fee_type: string;
  scope_kind: string;
  school_id:
    | string
    | null;
  branch_id:
    | string
    | null;
  amount_kobo:
    | string
    | number;
  effective_from:
    | string
    | Date;
};

type Replacement = {
  school_id: string;
  term_count: number;
  session_count: number;
};

type TermTrend = {
  school_id: string;
  school_name: string;
  session_name: string;
  term_name: string;
  position: number;
  ends_on:
    | string
    | Date;
  student_count: number;
};

type SessionTrend = {
  session_name: string;
  ends_on:
    | string
    | Date;
  school_count: number;
  student_count: number;
};

type ChartPoint = {
  label: string;
  value: number;
  note?: string;
};

function money(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-NG",
    {
      style:
        "currency",
      currency:
        "NGN",
      maximumFractionDigits:
        0,
    },
  ).format(
    value,
  );
}

function compact(
  value: number,
) {
  return new Intl.NumberFormat(
    "en-NG",
    {
      notation:
        "compact",
      maximumFractionDigits:
        1,
    },
  ).format(
    value,
  );
}

function AreaChart({
  title,
  subtitle,
  rows,
  formatter = compact,
}: {
  title: string;
  subtitle: string;
  rows: ChartPoint[];
  formatter?:
    (
      value: number,
    ) => string;
}) {
  const width =
    760;
  const height =
    270;
  const left =
    44;
  const right =
    24;
  const top =
    26;
  const bottom =
    52;
  const innerWidth =
    width -
    left -
    right;
  const innerHeight =
    height -
    top -
    bottom;

  const max =
    Math.max(
      1,
      ...rows.map(
        (
          row,
        ) =>
          row.value,
      ),
    );

  const points =
    rows.map(
      (
        row,
        index,
      ) => {
        const x =
          rows.length ===
          1
            ? left +
              innerWidth /
                2
            : left +
              (
                index /
                (
                  rows.length -
                  1
                )
              ) *
                innerWidth;
        const y =
          top +
          innerHeight -
          (
            row.value /
            max
          ) *
            innerHeight;

        return {
          ...row,
          x,
          y,
        };
      },
    );

  const linePath =
    points.length
      ? points
          .map(
            (
              point,
              index,
            ) =>
              `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
          )
          .join(
            " ",
          )
      : "";

  const areaPath =
    points.length
      ? `${linePath} L ${points.at(-1)?.x.toFixed(1)} ${(top + innerHeight).toFixed(1)} L ${points[0]?.x.toFixed(1)} ${(top + innerHeight).toFixed(1)} Z`
      : "";

  return (
    <section className="border border-black bg-white">
      <div className="flex items-end justify-between gap-4 border-b border-black p-5">
        <div>
          <p className="casa-kicker text-black/40">
            {subtitle}
          </p>
          <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
            {title}
          </h3>
        </div>
        {rows.length ? (
          <p className="font-mono text-xs font-semibold">
            {formatter(
              rows.at(-1)
                ?.value ??
                0,
            )}
          </p>
        ) : null}
      </div>

      <div className="p-4 sm:p-5">
        {rows.length ===
        0 ? (
          <div className="flex h-[270px] items-center justify-center border border-dashed border-black/20 bg-black/[0.015] text-sm text-black/45">
            Academic history will appear here as data accumulates.
          </div>
        ) : (
          <>
            <svg
              aria-label={title}
              className="h-auto w-full"
              role="img"
              viewBox={`0 0 ${width} ${height}`}
            >
              {[0, 0.25, 0.5, 0.75, 1].map(
                (
                  ratio,
                ) => {
                  const y =
                    top +
                    innerHeight *
                      ratio;
                  return (
                    <g
                      key={
                        ratio
                      }
                    >
                      <line
                        x1={
                          left
                        }
                        x2={
                          width -
                          right
                        }
                        y1={
                          y
                        }
                        y2={
                          y
                        }
                        stroke="currentColor"
                        strokeOpacity="0.08"
                      />
                    </g>
                  );
                },
              )}

              {areaPath ? (
                <path
                  d={
                    areaPath
                  }
                  fill="currentColor"
                  fillOpacity="0.06"
                />
              ) : null}

              {linePath ? (
                <path
                  d={
                    linePath
                  }
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                />
              ) : null}

              {points.map(
                (
                  point,
                ) => (
                  <g
                    key={`${point.label}-${point.x}`}
                  >
                    <circle
                      cx={
                        point.x
                      }
                      cy={
                        point.y
                      }
                      fill="#f2f2ef"
                      r="5"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <title>
                        {point.label}: {formatter(point.value)}
                      </title>
                    </circle>
                  </g>
                ),
              )}

              <text
                fill="currentColor"
                fontSize="10"
                opacity="0.45"
                x="4"
                y={
                  top +
                  4
                }
              >
                {formatter(
                  max,
                )}
              </text>
              <text
                fill="currentColor"
                fontSize="10"
                opacity="0.45"
                x="4"
                y={
                  top +
                  innerHeight
                }
              >
                0
              </text>
            </svg>

            <div
              className="mt-2 grid gap-2 text-[10px] text-black/45"
              style={{
                gridTemplateColumns:
                  `repeat(${Math.min(rows.length, 5)}, minmax(0, 1fr))`,
              }}
            >
              {rows
                .filter(
                  (
                    _row,
                    index,
                  ) =>
                    rows.length <=
                      5 ||
                    index ===
                      0 ||
                    index ===
                      rows.length -
                        1 ||
                    index %
                      Math.ceil(
                        rows.length /
                          4,
                      ) ===
                      0,
                )
                .slice(
                  0,
                  5,
                )
                .map(
                  (
                    row,
                  ) => (
                    <p
                      className="truncate font-mono uppercase"
                      key={
                        row.label
                      }
                    >
                      {row.label}
                    </p>
                  ),
                )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function ColumnChart({
  title,
  subtitle,
  rows,
  formatter = compact,
}: {
  title: string;
  subtitle: string;
  rows: ChartPoint[];
  formatter?:
    (
      value: number,
    ) => string;
}) {
  const max =
    Math.max(
      1,
      ...rows.map(
        (
          row,
        ) =>
          row.value,
      ),
    );

  return (
    <section className="border border-black bg-white">
      <div className="border-b border-black p-5">
        <p className="casa-kicker text-black/40">
          {subtitle}
        </p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.04em]">
          {title}
        </h3>
      </div>

      <div className="grid min-h-[300px] grid-cols-2 gap-4 p-5 sm:grid-cols-4 lg:grid-cols-6">
        {rows.length ===
        0 ? (
          <p className="col-span-full self-center text-center text-sm text-black/45">
            No data yet.
          </p>
        ) : (
          rows.map(
            (
              row,
            ) => (
              <div
                className="flex min-w-0 flex-col justify-end"
                key={
                  row.label
                }
              >
                <p className="mb-2 truncate text-center font-mono text-[9px] font-semibold">
                  {formatter(
                    row.value,
                  )}
                </p>
                <div className="flex h-40 items-end border-x border-t border-black/10 bg-black/[0.02]">
                  <div
                    className="w-full bg-black"
                    style={{
                      height:
                        `${Math.max(
                          row.value >
                            0
                            ? 4
                            : 0,
                          (
                            row.value /
                            max
                          ) *
                            100,
                        )}%`,
                    }}
                    title={`${row.label}: ${formatter(row.value)}`}
                  />
                </div>
                <p className="mt-2 truncate text-center text-[10px] font-medium">
                  {row.label}
                </p>
                {row.note ? (
                  <p className="mt-1 truncate text-center font-mono text-[8px] uppercase text-black/35">
                    {row.note}
                  </p>
                ) : null}
              </div>
            ),
          )
        )}
      </div>
    </section>
  );
}

export default function FinanceClient({
  schools,
  branches,
  pricing,
  replacements,
  termTrends,
  sessionTrends,
}: {
  schools:
    School[];
  branches:
    Branch[];
  pricing:
    Price[];
  replacements:
    Replacement[];
  termTrends:
    TermTrend[];
  sessionTrends:
    SessionTrend[];
}) {
  const router =
    useRouter();
  const [
    standard,
    setStandard,
  ] =
    useState("");
  const [
    replacement,
    setReplacement,
  ] =
    useState("");
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

  const current =
    (
      type:
        string,
      schoolId?:
        string,
      branchId?:
        string,
    ) => {
      const ranked =
        pricing
          .filter(
            (
              price,
            ) =>
              price.fee_type ===
                type &&
              (
                (
                  branchId &&
                  price.scope_kind ===
                    "BRANCH" &&
                  price.branch_id ===
                    branchId
                ) ||
                (
                  schoolId &&
                  price.scope_kind ===
                    "SCHOOL" &&
                  price.school_id ===
                    schoolId
                ) ||
                price.scope_kind ===
                  "GLOBAL"
              ),
          )
          .sort(
            (
              a,
              b,
            ) =>
              new Date(
                b.effective_from,
              ).getTime() -
              new Date(
                a.effective_from,
              ).getTime(),
          );

      const price =
        ranked.find(
          (
            entry,
          ) =>
            (
              branchId &&
              entry.scope_kind ===
                "BRANCH"
            ) ||
            (
              schoolId &&
              entry.scope_kind ===
                "SCHOOL"
            ) ||
            entry.scope_kind ===
              "GLOBAL",
        );

      return price
        ? Number(
            price.amount_kobo,
          ) /
            100
        : 0;
    };

  const totals =
    (() => {
        let totalStudents =
          0;
        let currentTermEstimate =
          0;
        let currentSessionEstimate =
          0;
        let currentTermReplacement =
          0;

        for (
          const school of
          schools
        ) {
          const students =
            Number(
              school.student_count,
            );
          const standardRate =
            current(
              "STANDARD_STUDENT",
              school.id,
            );
          const replacementRate =
            current(
              "REPLACEMENT_CARD",
              school.id,
            );
          const replacementCounts =
            replacements.find(
              (
                row,
              ) =>
                row.school_id ===
                school.id,
            );
          const termReplacement =
            Number(
              replacementCounts
                ?.term_count ??
                0,
            ) *
            replacementRate;
          const sessionReplacement =
            Number(
              replacementCounts
                ?.session_count ??
                0,
            ) *
            replacementRate;

          totalStudents +=
            students;
          currentTermEstimate +=
            students *
              standardRate +
            termReplacement;

          // CASA's billing model is exactly three terms per academic session.
          currentSessionEstimate +=
            students *
              standardRate *
              3 +
            sessionReplacement;

          currentTermReplacement +=
            termReplacement;
        }

        return {
          totalStudents,
          currentTermEstimate,
          currentSessionEstimate,
          currentTermReplacement,
        };
      })();

  const studentBySchool =
    schools
      .map(
        (
          school,
        ) => ({
          label:
            school.name,
          value:
            Number(
              school.student_count,
            ),
          note:
            school.current_term_name ??
            "No active term",
        }),
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.value -
          a.value,
      )
      .slice(
        0,
        12,
      );

  const revenueBySchool =
    schools
      .map(
        (
          school,
        ) => {
          const replacementCounts =
            replacements.find(
              (
                row,
              ) =>
                row.school_id ===
                school.id,
            );
          const replacementValue =
            Number(
              replacementCounts
                ?.term_count ??
                0,
            ) *
            current(
              "REPLACEMENT_CARD",
              school.id,
            );

          return {
            label:
              school.name,
            value:
              Number(
                school.student_count,
              ) *
                current(
                  "STANDARD_STUDENT",
                  school.id,
                ) +
              replacementValue,
            note:
              school.current_term_name ??
              school.current_session_name ??
              "No active period",
          };
        },
      )
      .sort(
        (
          a,
          b,
        ) =>
          b.value -
          a.value,
      )
      .slice(
        0,
        12,
      );

  const termMap =
    new Map<
      string,
      {
        value:
          number;
        end:
          number;
      }
    >();

  for (
    const row of
    termTrends
  ) {
    const label =
      `${row.session_name} · ${row.term_name}`;
    const prior =
      termMap.get(
        label,
      ) ?? {
        value: 0,
        end: 0,
      };

    termMap.set(
      label,
      {
        value:
          prior.value +
          Number(
            row.student_count,
          ),
        end:
          Math.max(
            prior.end,
            new Date(
              row.ends_on,
            ).getTime(),
          ),
      },
    );
  }

  const studentGrowth =
    [
      ...termMap.entries(),
    ]
      .sort(
        (
          a,
          b,
        ) =>
          a[1].end -
          b[1].end,
      )
      .slice(
        -10,
      )
      .map(
        ([
          label,
          row,
        ]) => ({
          label,
          value:
            row.value,
        }),
      );

  const schoolGrowth =
    sessionTrends
      .slice(
        -10,
      )
      .map(
        (
          row,
        ) => ({
          label:
            row.session_name,
          value:
            Number(
              row.school_count,
            ),
          note:
            `${row.student_count} students`,
        }),
      );

  async function save(
    event:
      FormEvent,
  ) {
    event.preventDefault();
    setBusy(
      true,
    );
    setError(
      "",
    );
    setNotice(
      "",
    );

    try {
      for (
        const [
          feeType,
          value,
        ] of [
          [
            "STANDARD_STUDENT",
            standard,
          ],
          [
            "REPLACEMENT_CARD",
            replacement,
          ],
        ] as const
      ) {
        if (
          value ===
          ""
        ) {
          continue;
        }

        const response =
          await fetch(
            "/api/internal/finance/pricing",
            {
              method:
                "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body:
                JSON.stringify({
                  feeType,
                  scopeKind:
                    "GLOBAL",
                  amountNaira:
                    Number(
                      value,
                    ),
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
              : "Pricing update failed.",
          );
        }
      }

      setStandard(
        "",
      );
      setReplacement(
        "",
      );
      setNotice(
        "Pricing updated successfully.",
      );
      router.refresh();
    } catch (
      caught
    ) {
      setError(
        caught instanceof
          Error
          ? caught.message
          : "Pricing update failed.",
      );
    } finally {
      setBusy(
        false,
      );
    }
  }

  return (
    <div className="px-5 py-6 sm:px-8 lg:px-10">
      <section className="grid gap-4 md:grid-cols-4">
        {[
          [
            "Active students",
            String(
              totals.totalStudents,
            ),
          ],
          [
            "Current term estimate",
            money(
              totals.currentTermEstimate,
            ),
          ],
          [
            "Current session estimate",
            money(
              totals.currentSessionEstimate,
            ),
          ],
          [
            "Current term replacement fees",
            money(
              totals.currentTermReplacement,
            ),
          ],
        ].map(
          ([
            label,
            value,
          ]) => (
            <div
              className="border border-black bg-white p-5"
              key={
                label
              }
            >
              <p className="casa-kicker text-black/40">
                {label}
              </p>
              <p className="mt-4 text-3xl font-semibold tracking-[-0.05em]">
                {value}
              </p>
              {label ===
              "Current session estimate" ? (
                <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.08em] text-black/35">
                  3-term projection
                </p>
              ) : null}
            </div>
          ),
        )}
      </section>

      <section className="mt-7 grid gap-5 xl:grid-cols-2">
        <AreaChart
          rows={
            studentGrowth
          }
          subtitle="Growth"
          title="Student growth by academic term"
        />
        <AreaChart
          rows={
            schoolGrowth
          }
          subtitle="Organizations"
          title="Schools represented by academic session"
        />
        <ColumnChart
          rows={
            studentBySchool
          }
          subtitle="Current distribution"
          title="Students by school"
        />
        <ColumnChart
          formatter={
            money
          }
          rows={
            revenueBySchool
          }
          subtitle="Term performance"
          title="Estimated revenue by school · current term"
        />
      </section>

      <section className="mt-7 grid gap-5 lg:grid-cols-[0.7fr_1.3fr]">
        <form
          className="border border-black bg-white p-5"
          onSubmit={
            save
          }
        >
          <p className="casa-kicker text-black/40">
            Global pricing
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Set current prices
          </h2>
          <p className="mt-2 text-xs leading-5 text-black/45">
            Standard student pricing is per academic term. CASA projects a full session as exactly three terms. New prices are versioned; older records remain available for analysis.
          </p>

          <label className="casa-label mt-5">
            <span>
              Standard student fee / term (₦)
            </span>
            <input
              className="casa-field"
              min="0"
              onChange={(event) =>
                setStandard(
                  event.target.value,
                )
              }
              placeholder={
                String(
                  current(
                    "STANDARD_STUDENT",
                  ) ||
                    6000,
                )
              }
              step="1"
              type="number"
              value={
                standard
              }
            />
          </label>

          <label className="casa-label mt-4">
            <span>
              Lost / faulty / replacement card fee (₦)
            </span>
            <input
              className="casa-field"
              min="0"
              onChange={(event) =>
                setReplacement(
                  event.target.value,
                )
              }
              placeholder={
                String(
                  current(
                    "REPLACEMENT_CARD",
                  ) ||
                    3000,
                )
              }
              step="1"
              type="number"
              value={
                replacement
              }
            />
          </label>

          {notice ? (
            <p className="mt-3 text-sm text-[#145a3b]">
              {notice}
            </p>
          ) : null}
          {error ? (
            <p className="mt-3 text-sm text-[#7e1d18]">
              {error}
            </p>
          ) : null}

          <button
            className="casa-button-primary mt-5"
            disabled={
              busy ||
              (
                standard ===
                  "" &&
                replacement ===
                  ""
              )
            }
          >
            {busy
              ? "Saving…"
              : "Save new pricing"}
          </button>
        </form>

        <div className="border border-black bg-white">
          <div className="border-b border-black p-5">
            <p className="casa-kicker text-black/40">
              Organizations
            </p>
            <h2 className="mt-2 text-2xl font-semibold">
              Current academic-period estimates
            </h2>
          </div>

          {schools.map(
            (
              school,
            ) => {
              const rate =
                current(
                  "STANDARD_STUDENT",
                  school.id,
                );
              const replacementRate =
                current(
                  "REPLACEMENT_CARD",
                  school.id,
                );
              const replacementCount =
                replacements.find(
                  (
                    row,
                  ) =>
                    row.school_id ===
                    school.id,
                )
                  ?.term_count ??
                0;

              return (
                <div
                  className="grid gap-3 border-b border-black/15 p-5 last:border-b-0 md:grid-cols-[1fr_auto_auto] md:items-center"
                  key={
                    school.id
                  }
                >
                  <div>
                    <p className="font-semibold">
                      {school.name}
                    </p>
                    <p className="mt-1 font-mono text-[9px] uppercase text-black/40">
                      {school.current_session_name ??
                        "No active session"}{" "}
                      ·{" "}
                      {school.current_term_name ??
                        "No active term"}
                    </p>
                  </div>
                  <p className="text-sm">
                    {school.student_count} registered students
                  </p>
                  <p className="text-sm">
                    {money(
                      Number(
                        school.student_count,
                      ) *
                        rate +
                        Number(
                          replacementCount,
                        ) *
                          replacementRate,
                    )}{" "}
                    / term est.
                  </p>
                </div>
              );
            },
          )}
        </div>
      </section>

      <section className="mt-7 border border-black bg-white">
        <div className="border-b border-black p-5">
          <p className="casa-kicker text-black/40">
            Campuses
          </p>
          <h2 className="mt-2 text-2xl font-semibold">
            Registered students & academic placement
          </h2>
          <p className="mt-2 max-w-3xl text-xs leading-5 text-black/45">
            Campus membership starts when a student is registered. Academic enrollment is separate, so a newly registered student can belong to Main Campus even before a class arm has been assigned.
          </p>
        </div>

        {branches.map(
          (
            branch,
          ) => {
            const school =
              schools.find(
                (
                  row,
                ) =>
                  row.id ===
                  branch.school_id,
              );
            const rate =
              current(
                "STANDARD_STUDENT",
                branch.school_id,
                branch.id,
              );

            return (
              <div
                className="grid gap-2 border-b border-black/15 p-5 last:border-b-0 md:grid-cols-[1fr_1fr_auto_auto_auto]"
                key={
                  branch.id
                }
              >
                <p className="font-semibold">
                  {branch.name}
                </p>
                <p className="text-sm text-black/50">
                  {school?.name}
                </p>
                <p className="text-sm">
                  {branch.student_count} registered
                </p>
                <p className="text-sm text-black/50">
                  {branch.enrolled_count} academically enrolled
                </p>
                <p className="text-sm">
                  {money(
                    Number(
                      branch.student_count,
                    ) *
                      rate,
                  )}{" "}
                  / term est.
                </p>
              </div>
            );
          },
        )}
      </section>
    </div>
  );
}
