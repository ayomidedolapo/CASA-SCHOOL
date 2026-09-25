import {
  NextRequest,
  NextResponse,
} from "next/server";
import {
  z,
} from "zod";

import {
  addExistingSummerParticipant,
  addGuestSummerParticipant,
  createSummerProgramme,
  getSummerProgrammeRoster,
  listSummerProgrammes,
  listSummerStudentOptions,
  markSummerAttendance,
  requireSummerBranchAccess,
  SummerProgrammeError,
} from "@/server/summer/programmes";
import {
  schoolOperationsErrorResponse,
  schoolOperationsNoStoreHeaders,
} from "@/server/school-operations/http";

export const dynamic =
  "force-dynamic";

type Ctx = {
  params:
    Promise<{
      slug:
        string;
    }>;
};

const base =
  z.object({
    branchId:
      z.string()
        .uuid(),
  });

const schema =
  z.discriminatedUnion(
    "action",
    [
      base.extend({
        action:
          z.literal(
            "CREATE_PROGRAMME",
          ),
        name:
          z.string()
            .trim()
            .min(2)
            .max(120),
        startsOn:
          z.string()
            .date(),
        endsOn:
          z.string()
            .date(),
        operatingDays:
          z.array(
            z.number()
              .int()
              .min(0)
              .max(6),
          )
            .min(1),
        checkInOpens:
          z.string()
            .regex(
              /^\d{2}:\d{2}$/,
            ),
        expectedArrival:
          z.string()
            .regex(
              /^\d{2}:\d{2}$/,
            ),
        checkInCloses:
          z.string()
            .regex(
              /^\d{2}:\d{2}$/,
            ),
        dismissalTime:
          z.string()
            .regex(
              /^\d{2}:\d{2}$/,
            ),
        checkoutCloses:
          z.string()
            .regex(
              /^\d{2}:\d{2}$/,
            ),
      }),
      base.extend({
        action:
          z.literal(
            "ADD_STUDENT",
          ),
        programmeId:
          z.string()
            .uuid(),
        studentId:
          z.string()
            .uuid(),
      }),
      base.extend({
        action:
          z.literal(
            "ADD_GUEST",
          ),
        programmeId:
          z.string()
            .uuid(),
        fullName:
          z.string()
            .trim()
            .min(2)
            .max(180),
        sex:
          z.string()
            .trim()
            .max(20)
            .nullable()
            .default(null),
        guardianName:
          z.string()
            .trim()
            .min(2)
            .max(180),
        guardianPhone:
          z.string()
            .trim()
            .max(40)
            .nullable()
            .default(null),
        guardianEmail:
          z.string()
            .email()
            .nullable()
            .default(null),
        notificationsEnabled:
          z.boolean()
            .default(true),
      }),
      base.extend({
        action:
          z.literal(
            "MARK_ATTENDANCE",
          ),
        programmeId:
          z.string()
            .uuid(),
        participantId:
          z.string()
            .uuid(),
        status:
          z.enum([
            "PRESENT",
            "LATE",
            "ABSENT",
          ]),
        note:
          z.string()
            .trim()
            .max(500)
            .nullable()
            .default(null),
      }),
    ],
  );

function fail(
  error:
    unknown,
) {
  if (
    error instanceof
      SummerProgrammeError
  ) {
    return NextResponse.json(
      {
        message:
          error.message,
        code:
          error.code,
      },
      {
        status:
          error.status,
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  }

  const response =
    schoolOperationsErrorResponse(
      error,
    );

  if (response) {
    return response;
  }

  throw error;
}

export async function GET(
  request:
    NextRequest,
  context:
    Ctx,
) {
  const {
    slug,
  } =
    await context.params;
  const branchId =
    request.nextUrl.searchParams.get(
      "branchId",
    );
  const programmeId =
    request.nextUrl.searchParams.get(
      "programmeId",
    );

  if (
    !branchId ||
    !z.string()
      .uuid()
      .safeParse(
        branchId,
      )
      .success
  ) {
    return NextResponse.json(
      {
        message:
          "Choose a campus.",
      },
      {
        status:
          400,
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  }

  try {
    const {
      access,
    } =
      await requireSummerBranchAccess(
        slug,
        branchId,
      );

    const [
      programmes,
      studentOptions,
    ] =
      await Promise.all([
        listSummerProgrammes(
          access,
          branchId,
        ),
        listSummerStudentOptions(
          access,
          branchId,
        ),
      ]);

    const roster =
      programmeId
        ? await getSummerProgrammeRoster(
            access,
            programmeId,
          )
        : [];

    return NextResponse.json(
      {
        programmes,
        roster,
        studentOptions,
        terminalRequired:
          false,
        operatorModel:
          "ADMIN_OR_TECHNICIAN",
      },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    return fail(
      error,
    );
  }
}

export async function POST(
  request:
    NextRequest,
  context:
    Ctx,
) {
  const {
    slug,
  } =
    await context.params;
  const body =
    schema.safeParse(
      await request.json()
        .catch(
          () =>
            null,
        ),
    );

  if (
    !body.success
  ) {
    return NextResponse.json(
      {
        message:
          "Check the Summer details.",
        issues:
          body.error.issues,
      },
      {
        status:
          400,
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  }

  try {
    const {
      access,
    } =
      await requireSummerBranchAccess(
        slug,
        body.data.branchId,
      );

    let result:
      unknown;

    switch (
      body.data.action
    ) {
      case "CREATE_PROGRAMME":
        result =
          await createSummerProgramme({
            ...body.data,
            access,
          });
        break;
      case "ADD_STUDENT":
        result =
          await addExistingSummerParticipant({
            ...body.data,
            access,
          });
        break;
      case "ADD_GUEST":
        result =
          await addGuestSummerParticipant({
            ...body.data,
            access,
          });
        break;
      case "MARK_ATTENDANCE":
        result =
          await markSummerAttendance({
            ...body.data,
            access,
          });
        break;
    }

    return NextResponse.json(
      {
        ok:
          true,
        result,
      },
      {
        headers:
          schoolOperationsNoStoreHeaders,
      },
    );
  } catch (error) {
    return fail(
      error,
    );
  }
}
