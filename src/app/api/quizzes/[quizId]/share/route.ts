import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { adminAuth, adminDb, isAdminConfigured, uidFromAuthHeader } from "@/lib/firebase/admin";
import { logRouteError } from "@/lib/log";
import { MAX_SHARE_RECIPIENTS, type ShareRecipient } from "@/lib/quiz-shared";

export const runtime = "nodejs";

/**
 * Sharing lives on the server for two reasons: `sharedWith` is not in the
 * client update allow-list (so a recipient can't add themselves), and resolving
 * an email to a uid needs the Admin SDK — the client never gets a user
 * directory, and recipients never learn each other's addresses.
 */
async function loadOwnedQuiz(uid: string, quizId: string) {
  const ref = adminDb().collection("quizzes").doc(quizId);
  const snapshot = await ref.get();
  const data = snapshot.data();
  if (!snapshot.exists || !data || data.ownerId !== uid) return null;
  return { ref, data };
}

function guard() {
  if (!isAdminConfigured) {
    return NextResponse.json({ error: "The server isn't configured for this yet." }, { status: 503 });
  }
  return null;
}

async function recipientsOf(uids: string[]): Promise<ShareRecipient[]> {
  if (uids.length === 0) return [];
  const result = await adminAuth().getUsers(uids.map((uid) => ({ uid })));
  return result.users.map((user) => ({
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? null,
  }));
}

/** Owner-only: this is what keeps recipients from seeing each other. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const blocked = guard();
  if (blocked) return blocked;

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in again and retry." }, { status: 401 });

  const { quizId } = await params;

  try {
    const quiz = await loadOwnedQuiz(uid, quizId);
    if (!quiz) return NextResponse.json({ error: "We couldn't find that quiz." }, { status: 404 });

    const shared = (quiz.data.sharedWith as string[] | undefined) ?? [];
    return NextResponse.json({ recipients: await recipientsOf(shared) });
  } catch (error) {
    logRouteError("quizzes.share.list", error, { uid, quizId });
    return NextResponse.json({ error: "Couldn't load who this is shared with." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const blocked = guard();
  if (blocked) return blocked;

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in again and retry." }, { status: 401 });

  const { quizId } = await params;

  let email = "";
  try {
    email = String(((await request.json()) as { email?: string }).email ?? "").trim();
  } catch {
    return NextResponse.json({ error: "That request didn't come through." }, { status: 400 });
  }
  if (!email) {
    return NextResponse.json({ error: "Enter the email address to share with." }, { status: 400 });
  }

  try {
    const quiz = await loadOwnedQuiz(uid, quizId);
    if (!quiz) return NextResponse.json({ error: "We couldn't find that quiz." }, { status: 404 });

    const shared = (quiz.data.sharedWith as string[] | undefined) ?? [];
    if (shared.length >= MAX_SHARE_RECIPIENTS) {
      return NextResponse.json(
        { error: `A quiz can be shared with up to ${MAX_SHARE_RECIPIENTS} people.` },
        { status: 400 },
      );
    }

    let recipient;
    try {
      recipient = await adminAuth().getUserByEmail(email);
    } catch {
      return NextResponse.json(
        { error: "No Reviewhere account uses that email address yet." },
        { status: 404 },
      );
    }

    if (recipient.uid === uid) {
      return NextResponse.json({ error: "This quiz is already yours." }, { status: 400 });
    }
    if (shared.includes(recipient.uid)) {
      return NextResponse.json({ error: "It's already shared with them." }, { status: 409 });
    }

    // Stamped so a recipient can see who sent it without reading the owner's profile.
    const owner = await adminAuth().getUser(uid);
    await quiz.ref.update({
      sharedWith: FieldValue.arrayUnion(recipient.uid),
      ownerName: owner.displayName ?? owner.email ?? "Someone",
    });

    return NextResponse.json({
      recipient: {
        uid: recipient.uid,
        email: recipient.email ?? null,
        displayName: recipient.displayName ?? null,
      },
    });
  } catch (error) {
    logRouteError("quizzes.share.add", error, { uid, quizId });
    return NextResponse.json({ error: "Couldn't share that quiz. Please try again." }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ quizId: string }> },
) {
  const blocked = guard();
  if (blocked) return blocked;

  const uid = await uidFromAuthHeader(request.headers.get("authorization"));
  if (!uid) return NextResponse.json({ error: "Please sign in again and retry." }, { status: 401 });

  const { quizId } = await params;

  let recipientUid = "";
  try {
    recipientUid = String(((await request.json()) as { uid?: string }).uid ?? "").trim();
  } catch {
    return NextResponse.json({ error: "That request didn't come through." }, { status: 400 });
  }
  if (!recipientUid) {
    return NextResponse.json({ error: "No recipient was named." }, { status: 400 });
  }

  try {
    const quiz = await loadOwnedQuiz(uid, quizId);
    if (!quiz) return NextResponse.json({ error: "We couldn't find that quiz." }, { status: 404 });

    await quiz.ref.update({ sharedWith: FieldValue.arrayRemove(recipientUid) });
    return NextResponse.json({ removed: true });
  } catch (error) {
    logRouteError("quizzes.share.remove", error, { uid, quizId });
    return NextResponse.json({ error: "Couldn't stop sharing. Please try again." }, { status: 500 });
  }
}
