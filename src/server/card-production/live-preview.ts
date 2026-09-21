import {
  eq,
} from "drizzle-orm";

import {
  getDb,
} from "@/db";
import {
  studentCardProductionJobs,
  studentCardTemplates,
} from "@/db/schema";

import {
  renderExistingStudentCardPreview,
} from "./render";
import {
  getPrivateCardObject,
} from "./storage";

export async function getCurrentCardProductionPreview(
  jobId: string,
): Promise<Buffer | null> {
  const db =
    getDb();

  const rows =
    await db
      .select({
        renderSnapshot:
          studentCardProductionJobs.renderSnapshot,
        frontArtifactKey:
          studentCardProductionJobs.frontArtifactKey,
        backArtifactKey:
          studentCardProductionJobs.backArtifactKey,
        previewArtifactKey:
          studentCardProductionJobs.previewArtifactKey,
        frontSourceKey:
          studentCardTemplates.frontSourceKey,
        backSourceKey:
          studentCardTemplates.backSourceKey,
        layout:
          studentCardTemplates.layout,
      })
      .from(
        studentCardProductionJobs,
      )
      .innerJoin(
        studentCardTemplates,
        eq(
          studentCardTemplates.id,
          studentCardProductionJobs.templateId,
        ),
      )
      .where(
        eq(
          studentCardProductionJobs.id,
          jobId,
        ),
      )
      .limit(1);

  const job =
    rows[0];

  if (!job) {
    return null;
  }

  const [
    frontSource,
    backSource,
    frontArtifact,
    backArtifact,
    storedPreview,
  ] =
    await Promise.all([
      getPrivateCardObject(
        job.frontSourceKey,
      ),
      getPrivateCardObject(
        job.backSourceKey,
      ),
      getPrivateCardObject(
        job.frontArtifactKey,
      ),
      getPrivateCardObject(
        job.backArtifactKey,
      ),
      getPrivateCardObject(
        job.previewArtifactKey,
      ),
    ]);

  if (
    !frontSource ||
    !backSource ||
    !frontArtifact ||
    !backArtifact
  ) {
    return storedPreview;
  }

  try {
    return await renderExistingStudentCardPreview({
      frontSource,
      backSource,
      frontArtifact,
      backArtifact,
      layout:
        job.layout,
      snapshot:
        job.renderSnapshot,
    });
  } catch {
    // Existing issued cards remain usable even if a historical
    // template source cannot be reconstructed. Fall back to the
    // immutable artifact rather than changing card lifecycle state.
    return storedPreview;
  }
}
