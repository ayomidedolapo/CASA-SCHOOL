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
  code: string;
  address: string | null;
  is_headquarters: boolean;
  status: string;
};

type BranchAdmin = {
  membership_id: string;
  full_name: string;
  email: string | null;
  is_active: boolean;
};

export default function BranchesClient({
  slug,
}: {
  slug: string;
}) {
  const [branches, setBranches] =
    useState<Branch[]>([]);
  const [selected, setSelected] =
    useState("");
  const [admins, setAdmins] =
    useState<BranchAdmin[]>([]);
  const [setup, setSetup] =
    useState<{
      url: string;
      expiresAt: string;
    } | null>(null);
  const [error, setError] =
    useState("");
  const [notice, setNotice] =
    useState("");
  const [busy, setBusy] =
    useState(false);

  const branchAdminChoices =
    useMemo(
      () =>
        branches.filter(
          (branch) =>
            !branch.is_headquarters &&
            branch.status ===
              "ACTIVE",
        ),
      [branches],
    );

  const fetchBranches =
    useCallback(async () => {
      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/branches/provisioning`,
          {
            cache:
              "no-store",
          },
        );
      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Branches could not be loaded.",
        );
      }

      return (
        body.branches ??
        []
      ) as Branch[];
    }, [slug]);

  const load =
    useCallback(async () => {
      const nextBranches =
        await fetchBranches();
      setBranches(
        nextBranches,
      );
    }, [fetchBranches]);

  const loadAdmins =
    useCallback(
      async (
        branchId: string,
      ) => {
        if (!branchId) {
          setAdmins([]);
          return;
        }

        const response =
          await fetch(
            `/api/schools/${encodeURIComponent(
              slug,
            )}/branches/${encodeURIComponent(
              branchId,
            )}/admins`,
            {
              cache:
                "no-store",
            },
          );
        const body =
          await response.json();

        if (!response.ok) {
          throw new Error(
            body.message ??
              "Branch administrators could not be loaded.",
          );
        }

        setAdmins(
          body.administrators ??
            [],
        );
      },
      [slug],
    );

  useEffect(() => {
    let active = true;

    void fetchBranches()
      .then(
        (
          nextBranches,
        ) => {
          if (active) {
            setBranches(
              nextBranches,
            );
          }
        },
      )
      .catch(
        (
          cause,
        ) => {
          if (active) {
            setError(
              cause instanceof
                Error
                ? cause.message
                : "Branches could not be loaded.",
            );
          }
        },
      );

    return () => {
      active = false;
    };
  }, [fetchBranches]);

  useEffect(() => {
    if (!selected) {
      return;
    }

    let active = true;

    void fetch(
      `/api/schools/${encodeURIComponent(
        slug,
      )}/branches/${encodeURIComponent(
        selected,
      )}/admins`,
      {
        cache:
          "no-store",
      },
    )
      .then(
        async (
          response,
        ) => {
          const body =
            await response.json();
          if (!response.ok) {
            throw new Error(
              body.message ??
                "Branch administrators could not be loaded.",
            );
          }
          return (
            body.administrators ??
            []
          ) as BranchAdmin[];
        },
      )
      .then(
        (
          nextAdmins,
        ) => {
          if (active) {
            setAdmins(
              nextAdmins,
            );
          }
        },
      )
      .catch(
        (
          cause,
        ) => {
          if (active) {
            setError(
              cause instanceof
                Error
                ? cause.message
                : "Branch administrators could not be loaded.",
            );
          }
        },
      );

    return () => {
      active = false;
    };
  }, [
    selected,
    slug,
  ]);

  async function create(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    const form =
      new FormData(
        event.currentTarget,
      );
    setBusy(true);
    setError("");
    setNotice("");
    setSetup(null);

    try {
      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/branches/provisioning`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                name:
                  form.get(
                    "name",
                  ),
                code:
                  form.get(
                    "code",
                  ),
                address:
                  form.get(
                    "address",
                  ) ||
                  null,
                copyHeadquartersClassArms:
                  false,
              }),
          },
        );
      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Branch could not be created.",
        );
      }

      (
        event.currentTarget
      ).reset();
      setNotice(
        "Branch created. Select it on the right to appoint its first Branch Admin.",
      );
      await load();

      if (
        body.branch?.id
      ) {
        setSelected(
          body.branch.id,
        );
      }
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Branch could not be created.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function provisionAdmin(
    event:
      FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!selected) {
      return;
    }

    const form =
      new FormData(
        event.currentTarget,
      );
    setBusy(true);
    setError("");
    setNotice("");
    setSetup(null);

    try {
      const response =
        await fetch(
          `/api/schools/${encodeURIComponent(
            slug,
          )}/branches/${encodeURIComponent(
            selected,
          )}/admins`,
          {
            method:
              "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body:
              JSON.stringify({
                fullName:
                  form.get(
                    "fullName",
                  ),
                email:
                  form.get(
                    "email",
                  ),
              }),
          },
        );
      const body =
        await response.json();

      if (!response.ok) {
        throw new Error(
          body.message ??
            "Branch Admin could not be provisioned.",
        );
      }

      (
        event.currentTarget
      ).reset();
      const nextSetup =
        body.administrator
          ?.setup ??
        null;
      setSetup(
        nextSetup,
      );
      setNotice(
        nextSetup
          ? "Branch Admin created. Share the one-time setup link below privately."
          : "Branch Admin assigned. This person already has a CASA password, so no setup link is required.",
      );
      await loadAdmins(
        selected,
      );
    } catch (cause) {
      setError(
        cause instanceof
          Error
          ? cause.message
          : "Branch Admin could not be provisioned.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8">
      {error ? (
        <div
          className="mb-4 border border-red-800 bg-red-50 p-3 text-sm text-red-800"
          role="alert"
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          className="mb-4 border border-black bg-white p-3 text-sm"
          role="status"
        >
          {notice}
        </div>
      ) : null}

      {setup ? (
        <div className="mb-4 border border-black bg-[#e8f2ec] p-4">
          <p className="casa-kicker">
            One-time Branch Admin setup
          </p>
          <p className="mt-2 break-all font-mono text-[10px]">
            {setup.url}
          </p>
          <p className="mt-2 text-xs text-black/50">
            Expires after 24 hours and becomes unusable after the password is set.
          </p>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="space-y-6">
          <form
            onSubmit={create}
            className="border border-black bg-white p-5"
          >
            <p className="casa-kicker text-black/40">
              Create branch
            </p>
            <h2 className="mt-2 text-xl font-semibold">
              New campus
            </h2>
            <p className="mt-2 text-xs text-black/50">
              HQ can create the campus and appoint its first Branch Admin, but it does not gain operational control over that branch.
            </p>

            <div className="mt-4 grid gap-3">
              <input
                className="casa-field"
                name="name"
                placeholder="Branch name"
                required
              />
              <input
                className="casa-field"
                name="code"
                placeholder="Code"
                required
              />
              <input
                className="casa-field"
                name="address"
                placeholder="Address"
              />
            </div>

            <button
              disabled={busy}
              className="casa-button-primary mt-4"
            >
              Create branch
            </button>
          </form>

          <section className="border border-black bg-white p-5">
            <p className="casa-kicker text-black/40">
              Organization campus directory
            </p>
            <p className="mt-2 text-xs text-black/50">
              This is organization awareness only. HQ operations remain scoped to HQ; each branch operates through its assigned Branch Admin.
            </p>

            <div className="mt-4 divide-y divide-black/15 border-t border-black">
              {branches.map(
                (
                  branch,
                ) => (
                  <div
                    key={
                      branch.id
                    }
                    className="py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <strong className="text-sm">
                        {branch.name}
                        {branch.is_headquarters
                          ? " · HQ"
                          : ""}
                      </strong>
                      <span className="font-mono text-[9px] uppercase text-black/45">
                        {branch.code} · {branch.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-black/45">
                      {branch.address ??
                        "No address"}
                    </p>
                  </div>
                ),
              )}
            </div>
          </section>
        </div>

        <section className="border border-black bg-white p-5">
          <p className="casa-kicker text-black/40">
            Branch administrators
          </p>
          <h2 className="mt-2 text-xl font-semibold">
            Appoint the campus operator
          </h2>

          <select
            className="casa-field mt-4"
            value={selected}
            onChange={(
              event,
            ) => {
              setSelected(
                event.target.value,
              );
              setAdmins([]);
              setSetup(null);
            }}
          >
            <option value="">
              Choose branch
            </option>
            {branchAdminChoices.map(
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

          {selected ? (
            <div className="mt-5">
              <p className="text-sm font-semibold">
                Current administrators
              </p>

              {admins.length ===
              0 ? (
                <p className="mt-2 text-sm text-black/45">
                  No Branch Admin yet.
                </p>
              ) : (
                admins.map(
                  (
                    admin,
                  ) => (
                    <div
                      key={
                        admin.membership_id
                      }
                      className="mt-2 border border-black/15 p-3 text-sm"
                    >
                      <strong>
                        {admin.full_name}
                      </strong>
                      <div className="text-black/45">
                        {admin.email ??
                          "No email"}{" "}
                        ·{" "}
                        {admin.is_active
                          ? "Active"
                          : "Inactive"}
                      </div>
                    </div>
                  ),
                )
              )}

              <form
                className="mt-5 grid gap-3 border-t border-black/20 pt-5"
                onSubmit={
                  provisionAdmin
                }
              >
                <p className="text-sm font-semibold">
                  Add Branch Admin
                </p>
                <input
                  className="casa-field"
                  name="fullName"
                  placeholder="Full name"
                  required
                />
                <input
                  className="casa-field"
                  name="email"
                  type="email"
                  placeholder="Email"
                  required
                />
                <button
                  className="casa-button-primary"
                  disabled={busy}
                >
                  Provision Branch Admin
                </button>
              </form>
            </div>
          ) : (
            <p className="mt-4 text-sm text-black/45">
              Select a non-HQ branch to view or appoint its administrator.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
