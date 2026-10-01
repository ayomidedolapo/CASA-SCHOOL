import {
  NextResponse,
} from "next/server";

import {
  registryAuthErrorResponse,
  registryNoStoreHeaders,
  requireRegistryAdmin,
} from "@/server/registry/http";
import {
  listVisibleBranches,
} from "@/server/school-operations/operations";
import {
  listBranchTransferWorkspace,
} from "@/server/school-operations/transfers";

export const dynamic =
  "force-dynamic";

export async function GET(
  _request: Request,
  context: {
    params: Promise<{
      slug: string;
    }>;
  },
) {
  const {
    slug,
  } = await context.params;

  try {
    const access =
      await requireRegistryAdmin(
        slug,
      );
    const visibility =
      await listVisibleBranches(
        slug,
      );
    const visibleBranchIds =
      (
        visibility.branches as
          Array<{
            id: string;
          }>
      ).map(
        (branch) =>
          branch.id,
      );

    const workspace =
      await listBranchTransferWorkspace({
        schoolId:
          access.school.id,
        visibleBranchIds,
      });

    return NextResponse.json(
      workspace,
      {
        headers:
          registryNoStoreHeaders,
      },
    );
  } catch (error) {
    const auth =
      registryAuthErrorResponse(
        error,
      );

    if (auth) {
      return auth;
    }

    throw error;
  }
}
