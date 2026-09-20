import GuardianNotificationClient from "./guardian-notification-client";

export default async function GuardianNotificationPage(
  {
    params,
  }: {
    params:
      Promise<{
        token: string;
      }>;
  },
) {
  const {
    token,
  } =
    await params;

  return (
    <GuardianNotificationClient
      token={token}
    />
  );
}
