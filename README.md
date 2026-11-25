# Cloud Drop

A small file-sharing app built with Next.js App Router, React, TypeScript, and Tailwind CSS. Anyone can upload a file up to 10 MiB and share an expiring link. Accounts are optional; recipients do not sign in.

## Local prototype

Run `npm install`, then `npm run dev` and open `http://localhost:3000`. Choose or drop a file, select an expiry, upload, copy the link, and open it. The 1-minute choice exercises the expired state. Local files and metadata live in ignored `.local-data/`. This mode makes no AWS calls and must stay on your computer.

Run `npm run lint`, `npm run typecheck`, `npm test`, and `npm run build` for local checks.

## Server configuration

Copy `.env.example` to `.env.local` for local development. Never commit `.env.local`. Production requires server-side `STORAGE_MODE=aws`, `CLOUD_DROP_REGION`, `CLOUD_DROP_BUCKET`, `CLOUD_DROP_TABLE`, `APP_ORIGIN`, `COGNITO_USER_POOL_ID`, `COGNITO_CLIENT_ID`, and `COGNITO_DOMAIN`. The app fails visibly if production settings are missing. None of these variables use a `NEXT_PUBLIC_` prefix. Bucket names, pool IDs, and app client IDs are configuration identifiers, not credentials, but still belong outside source code. AWS credentials come from a local profile during development or a temporary IAM compute role when hosted. Never put access keys, session tokens, client secrets, or live presigned URLs in git or chat.

`STORAGE_MODE=s3` is a development-only bridge: the browser uploads to private S3, while share metadata remains on the local computer. It requires `CLOUD_DROP_REGION` and `CLOUD_DROP_BUCKET` and an owner-configured local AWS profile. The signed POST expires after 60 seconds, limits the object key and file size, and the server verifies the object before creating a share. Do not publicly host this mode.

`STORAGE_MODE=aws` stores pending uploads, shares, and atomic rate-limit counters in DynamoDB. Expiry is checked on each recipient request; TTL only removes metadata later. Expired links do not delete S3 objects. Separate S3 cleanup is still needed. The browser receives a temporary, object-scoped signed POST. It never receives AWS credentials. The app checks upload origin, verifies the S3 object, and limits upload authorization to 3 per IP per hour and 100 globally per day. Signup is limited to 3 per IP per hour and 50 globally per day. Finalization and downloads have their own limits. These are application limits; IP-based limits are best effort, and public uploads can still incur AWS costs.

Optional accounts use Cognito managed login with authorization code and PKCE. Signup asks for name, email, password, and confirmation. Server-side `AdminCreateUser` suppresses the invitation email and `AdminSetUserPassword` sets a permanent password. No confirmation email is sent. Because email ownership is not verified, do not enable email-based account recovery until verification is added. Anonymous uploads remain allowed.

## AWS learning path

The project owner performs every live AWS action: IAM, DynamoDB, Cognito, deployment, verification, and cleanup. Local checks do not establish that any AWS integration works. The private S3 bucket exists according to the owner, but no live upload or hosted deployment has been verified. Each AWS step is handed off separately with exact Console settings and a verification result to report back.



DAY 2 DO - 
Cloud Drop now has the local sharing flow, anonymous upload limits, and optional signup and sign-in code. Signup asks for name, email, password, and confirmation; the Cognito integration is set to suppress the invitation email. AWS settings are read from server environment variables, and I found no account IDs, bucket name, or credential patterns hardcoded in the project. Lint, typecheck, tests, and build pass. No live AWS upload or public deployment has been verified.

### AWS checkpoint: first private S3 upload

This step gives the local app permission to upload to your private bucket using a narrowly scoped role. Use the project account 532369406646, bucket cloud-drop-dev-yk, and Region US East (Ohio), us-east-2. S3 storage and requests can incur charges. Keep all four Block Public Access settings on; this step does not publish the bucket.

1. In the project account’s IAM Console, open Policies → Create policy → JSON. Paste s3-app-policy.example.json, replacing <BUCKET_NAME> with cloud-drop-dev-yk. Name it CloudDropS3AppDevPolicy and create it. The policy permits object upload and read only under uploads/; GetObject also permits the app’s object check. IAM policy steps (https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_create-console.html), S3 permission mapping (https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html)
2. Open Roles → Create role → Custom trust policy. Paste s3-app-trust.example.json, replacing <ACCOUNT_ID> with 532369406646 and <PROJECT_DEVELOPER_ROLE_NAME> with AccountFullAccessRole. Attach CloudDropS3AppDevPolicy. Name the role CloudDropS3AppDev and create it. IAM role steps (https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_create_for-custom.html)
3. On your computer, add this profile to ~/.aws/config:

   [profile cloud-drop-s3-app]
role_arn = arn:aws:iam::532369406646:role/CloudDropS3AppDev
source_profile = cloud-drop-dev
region = us-east-2
   Then run aws sts get-caller-identity --profile cloud-drop-s3-app. The returned ARN should contain assumed-role/CloudDropS3AppDev/. Do not paste the full output or credentials here. AWS CLI role profiles (https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-role.html)
4. Put these values in your ignored .env.local, then run the app:

   STORAGE_MODE=s3
CLOUD_DROP_REGION=us-east-2
CLOUD_DROP_BUCKET=cloud-drop-dev-yk

   AWS_PROFILE=cloud-drop-s3-app npm run dev
5. Upload a small test file at http://localhost:3000, open its recipient page, and download it. In the S3 Console, confirm one object appears under uploads/ and Block Public Access remains enabled. The share link in this development mode works only while this local app and its metadata are available. S3 public access settings (https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html)

Please report only: whether role assumption succeeded, whether upload and download succeeded, whether the object appeared, and any error message with IDs or signed URLs removed. Then I’ll move to the DynamoDB checkpoint.

