import { ChatGroq } from "@langchain/groq";
import { SystemMessage, AIMessage } from "@langchain/core/messages";
import {
  StateGraph,
  MessagesAnnotation,
  END,
  START,
  Annotation,
} from "@langchain/langgraph";

import { createBooking } from "../domain/dental/tools/createBooking.js";
import { cancelBooking } from "../domain/dental/tools/cancelBooking.js";

import {
  speakDate,
  speakTime,
  weekdayOf,
  addDays,
} from "../domain/dental/scheduling.js";

import {
  EMPTY_BOOKING,
  updateBooking,
  nextMissing,
} from "./bookingState.js";

const HISTORY_MESSAGES = 6;

// ================================================================
// STATE
// ================================================================

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,

  conversationState: Annotation({
    reducer: (current, update) => ({
      ...current,
      ...update,
    }),

    default: () => ({
      ...EMPTY_BOOKING,
    }),
  }),

  turn: Annotation({
    reducer: (_, update) => update,

    default: () => ({}),
  }),
});

// ================================================================
// LLM
// ================================================================

const llmPlain = new ChatGroq({
  model: "openai/gpt-oss-20b",
  temperature: 0,
  maxRetries: 0,
});

// ================================================================
// HELPERS
// ================================================================

const lastUserText = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];

    const type =
      m.type ??
      m._getType?.() ??
      m.role;

    if (type === "human" || type === "user") {
      return String(m.content || "");
    }
  }

  return "";
};

// ================================================================
// EMAIL SPEAKING
// ================================================================

// Example:
// agam2001@gmail.com
// ->
// agam2001 at gmail dot com

const speakEmail = (e) =>
  String(e || "")
    .replace("@", " at ")
    .replace(/\./g, " dot ")
    .replace(/\s+/g, " ")
    .trim();

// ================================================================
// FULL BOOKING SUMMARY
// ================================================================

const fullBookingSummary = (b, t) => {
  return (
    `your name is ${b.patientName}, ` +
    `your email is ${speakEmail(b.patientEmail)}, ` +
    `your treatment is ${b.treatment}, ` +
    `your doctor is ${b.doctorName}, ` +
    `your appointment is on ${speakDate(b.date, t.today)} ` +
    `at ${speakTime(b.time)}`
  );
};

// ================================================================
// PREPARE NODE
// ================================================================

const prepareNode = async (state) => {
  const transcript = lastUserText(state.messages);

  console.log(
    "📦 Booking state BEFORE:",
    JSON.stringify(state.conversationState)
  );

  console.log(
    "🎤 USER TRANSCRIPT:",
    transcript
  );

  const { booking, ctx } = await updateBooking(
    state.conversationState,
    transcript
  );

  console.log(
    "📦 Booking state AFTER:",
    JSON.stringify(booking)
  );

  return {
    conversationState: booking,
    turn: ctx,
  };
};

// ================================================================
// ROUTING
// ================================================================

const routeAfterPrepare = (state) => {
  // --------------------------------------------------------------
  // CANCELLATION HAS HIGHEST PRIORITY
  // --------------------------------------------------------------

  if (state.conversationState.cancellationConfirmed) {
    return "cancel";
  }

  // --------------------------------------------------------------
  // NORMAL BOOKING
  // --------------------------------------------------------------

  if (
    state.conversationState.confirmed &&
    !state.conversationState.bookingId
  ) {
    return "book";
  }

  // --------------------------------------------------------------
  // NORMAL AGENT RESPONSE
  // --------------------------------------------------------------

  return "agent";
};

// ================================================================
// BOOKING NODE
// ================================================================

const bookNode = async (state) => {
  const b = state.conversationState;

  console.log(
    "🧾 Caller confirmed → createBooking"
  );

  const res = JSON.parse(
    await createBooking.invoke({
      patientName: b.patientName,
      doctorName: b.doctorName,
      treatment: b.treatment,
      date: b.date,
      time: b.time,

      whatsappNumber:
        b.whatsappNumber || undefined,

      patientEmail: b.patientEmail,
    })
  );

  console.log(
    "🧾 createBooking result:",
    res
  );

  // --------------------------------------------------------------
  // BOOKING FAILED
  // --------------------------------------------------------------

  if (!res.success) {
    const patch = {
      confirmed: false,
    };

    if (res.problem) {
      patch[res.problem] = "";
    }

    return {
      conversationState: patch,

      turn: {
        ...state.turn,
        bookingResult: res,
      },
    };
  }

  // --------------------------------------------------------------
  // BOOKING SUCCESS
  // --------------------------------------------------------------

  console.log(
    "📧 Appointment booking successful."
  );

  console.log(
    "🆔 Booking ID:",
    res.bookingId
  );

  console.log(
    "📧 Email confirmation handled by createBooking."
  );

  return {
    conversationState: {
      bookingId: res.bookingId,
      confirmed: true,
      patientEmail:
        res.patientEmail ||
        b.patientEmail,
    },

    turn: {
      ...state.turn,

      bookingResult: {
        ...res,
        emailSent:
          res.emailSent ?? true,
      },
    },
  };
};

// ================================================================
// CANCELLATION NODE
// ================================================================

const cancelNode = async (state) => {
  const b = state.conversationState;

  console.log(
    "🗑️ Caller gave FINAL cancellation confirmation"
  );

  console.log(
    "🆔 Cancellation Booking ID:",
    b.cancellationBookingId
  );

  console.log(
    "📝 Cancellation reason:",
    b.cancellationReason
  );

  // --------------------------------------------------------------
  // EXECUTE CANCELLATION
  // --------------------------------------------------------------

  const res = JSON.parse(
    await cancelBooking.invoke({
      bookingId:
        b.cancellationBookingId,

      reason:
        b.cancellationReason,
    })
  );

  console.log(
    "🗑️ cancelBooking result:",
    res
  );

  // --------------------------------------------------------------
  // CANCELLATION FAILED
  // --------------------------------------------------------------

  if (!res.success) {
    return {
      conversationState: {
        cancellationConfirmed: false,
      },

      turn: {
        ...state.turn,

        cancellationResult: res,
      },
    };
  }

  // --------------------------------------------------------------
  // CANCELLATION SUCCESS
  // --------------------------------------------------------------

  console.log(
    "✅ Appointment cancelled successfully."
  );

  console.log(
    "🗂️ Cancellation record created:",
    res.cancellationId
  );

  console.log(
    "📧 Cancellation email:",
    res.emailSent
  );

  return {
    conversationState: {
      cancellationMode: false,

      cancellationBookingId: "",

      cancellationAppointment:
        null,

      cancellationDetailsConfirmed:
        false,

      cancellationReason: "",

      cancellationFinalConfirmationPending:
        false,

      cancellationConfirmed:
        false,
    },

    turn: {
      ...state.turn,

      cancellationResult: res,
    },
  };
};

// ================================================================
// SLOT LIST
// ================================================================

const list = (slots) =>
  slots
    .slice(0, 8)
    .map(speakTime)
    .join(", ");

// ================================================================
// CANCELLATION NEXT ACTION
// ================================================================

const nextCancellationAction = (b, t) => {
  const appointment =
    b.cancellationAppointment;

  // --------------------------------------------------------------
  // STEP 1: BOOKING ID
  // --------------------------------------------------------------

  if (!b.cancellationBookingId) {
    return (
      "Ask the caller for their unique booking ID."
    );
  }

  // --------------------------------------------------------------
  // STEP 2: APPOINTMENT DETAILS CONFIRMATION
  // --------------------------------------------------------------

  if (
    !b.cancellationDetailsConfirmed
  ) {
    if (!appointment) {
      return (
        "Ask the caller for their booking ID again."
      );
    }

    return (
      `Tell the caller you found booking ` +
      `${appointment.bookingId}. ` +
      `The appointment is for ` +
      `${appointment.patientName}, ` +
      `${appointment.treatment} with ` +
      `${appointment.doctorName}, ` +
      `${speakDate(
        appointment.date,
        t.today
      )} at ` +
      `${speakTime(
        appointment.time
      )}. ` +
      `Ask if these appointment details are correct.`
    );
  }

  // --------------------------------------------------------------
  // STEP 3: CANCELLATION REASON
  // --------------------------------------------------------------

  if (!b.cancellationReason) {
    return (
      "Ask the caller for the reason for cancelling the appointment."
    );
  }

  // --------------------------------------------------------------
  // STEP 4: FINAL CONFIRMATION
  // --------------------------------------------------------------

  if (
    b.cancellationFinalConfirmationPending
  ) {
    if (!appointment) {
      return (
        "There is a problem with the appointment details. " +
        "Ask the caller for their booking ID again."
      );
    }

    return (
      `Read the cancellation summary. ` +
      `Booking ID ${appointment.bookingId}, ` +
      `${appointment.patientName}, ` +
      `${appointment.treatment} with ` +
      `${appointment.doctorName}, ` +
      `${speakDate(
        appointment.date,
        t.today
      )} at ` +
      `${speakTime(
        appointment.time
      )}. ` +
      `The cancellation reason is ` +
      `${b.cancellationReason}. ` +
      `Ask the caller if they want to cancel this appointment.`
    );
  }

  return (
    "Ask the caller to confirm the cancellation."
  );
};

// ================================================================
// NEXT ACTION
// ================================================================

const nextAction = (b, t) => {
  const r = t.bookingResult;

  const cancellationResult =
    t.cancellationResult;

  // ==============================================================
  // CANCELLATION SUCCESS
  // ==============================================================

  if (cancellationResult?.success) {
    return (
      `The cancellation is DONE for booking ` +
      `${cancellationResult.bookingId}. ` +
      `Tell the caller their appointment with ` +
      `${cancellationResult.doctorName} for ` +
      `${cancellationResult.treatment} ` +
      `${speakDate(
        cancellationResult.date,
        t.today
      )} at ` +
      `${speakTime(
        cancellationResult.time
      )} has been cancelled successfully. ` +
      `A cancellation email has been sent to their email address. ` +
      `Then ask if they need anything else.`
    );
  }

  // ==============================================================
  // CANCELLATION FAILED
  // ==============================================================

  if (
    cancellationResult &&
    !cancellationResult.success
  ) {
    return (
      `The cancellation FAILED: ` +
      `"${cancellationResult.message}". ` +
      `Do not say that the appointment was cancelled. ` +
      `Apologise briefly and ask the caller to try again.`
    );
  }

  // ==============================================================
  // ACTIVE CANCELLATION FLOW
  // ==============================================================

  if (b.cancellationMode) {
    return nextCancellationAction(
      b,
      t
    );
  }

  // ==============================================================
  // BOOKING SUCCESS
  // ==============================================================

  if (r?.success) {
    return (
      `The booking is DONE ` +
      `(id ${r.bookingId}). ` +
      `Tell the caller it is confirmed with ` +
      `${r.doctorName} for ` +
      `${r.treatment} ` +
      `${speakDate(
        r.date,
        t.today
      )} at ` +
      `${speakTime(
        r.time
      )}. ` +
      `A confirmation email has been sent to their email address. ` +
      `Then ask if they need anything else.`
    );
  }

  // ==============================================================
  // BOOKING FAILED
  // ==============================================================

  if (
    r &&
    !r.success
  ) {
    return (
      `The booking FAILED: ` +
      `"${r.message}". ` +
      `Do NOT say it is booked. ` +
      `Apologise briefly, explain the problem, ` +
      `and ask for the new value of the missing field below.`
    );
  }

  // ==============================================================
  // NORMAL BOOKING FLOW
  // ==============================================================

  switch (
    nextMissing(b)
  ) {
    // ------------------------------------------------------------
    // NAME
    // ------------------------------------------------------------

    case "patientName":
      return (
        "Ask for the caller's name."
      );

    // ------------------------------------------------------------
    // TREATMENT
    // ------------------------------------------------------------

    case "treatment":
      return (
        `Ask which treatment they need. ` +
        `Treatments we offer: ` +
        `${t.treatments.join(", ")}.`
      );

    // ------------------------------------------------------------
    // DOCTOR
    // ------------------------------------------------------------

    case "doctorName":
      return t.doctorOptions.length === 0
        ? (
          `No doctor in our database handles ` +
          `"${b.treatment}". ` +
          `Say so honestly and ask if they need ` +
          `a different treatment ` +
          `(we offer: ` +
          `${t.treatments.join(", ")}). ` +
          `Do not invent a doctor.`
        )

        : t.doctorOptions.length === 1
          ? (
            `Tell the caller ` +
            `${t.doctorOptions[0].name} ` +
            `specialises in ${b.treatment}, ` +
            `and ask if they would like to book with ` +
            `${t.doctorOptions[0].name}.`
          )

          : (
            `Tell the caller these doctors handle ` +
            `${b.treatment}: ` +
            `${t.doctorOptions
              .map((d) => d.name)
              .join(", ")}. ` +
            `Ask which one they prefer.`
          );

    // ------------------------------------------------------------
    // DATE
    // ------------------------------------------------------------

    case "date":
      return (
        `Ask for the preferred date. ` +
        `${b.doctorName} works ` +
        `${
          t.doctor?.availableDays?.join(
            ", "
          ) ||
          "the available working days"
        }`
      );

    // ------------------------------------------------------------
    // TIME
    // ------------------------------------------------------------

    case "time":
      return (
        `Ask for the preferred time. ` +
        `Free slots on that date: ` +
        `${list(
          t.availability?.freeSlots ||
          []
        )}.`
      );

    // ------------------------------------------------------------
    // EMAIL
    // ------------------------------------------------------------

    case "patientEmail":
      return (
        "Ask the caller for their email address for the appointment confirmation."
      );

    // ------------------------------------------------------------
    // ALL DETAILS AVAILABLE
    // ------------------------------------------------------------

    default:
      return (
        `Before booking, read the COMPLETE booking details ` +
        `to the caller. ` +
        `Say: "Just to confirm, ` +
        `${fullBookingSummary(
          b,
          t
        )}. Is everything correct?" ` +
        `Read all six details: name, email, treatment, doctor, date and time. ` +
        `If the caller says something is wrong but not what, ` +
        `ask which detail is incorrect. ` +
        `If the caller corrects any detail, acknowledge the correction ` +
        `and read the COMPLETE UPDATED booking details again. ` +
        `Do not say the appointment is booked or confirmed yet.`
      );
  }
};

// ================================================================
// SYSTEM PROMPT
// ================================================================

const buildSystemPrompt = (b, t) => {
  const today = t.today;

  const facts = [];

  const a = t.availability;

  // --------------------------------------------------------------
  // AVAILABLE SLOTS
  // --------------------------------------------------------------

  if (a?.freeSlots?.length) {
    facts.push(
      `Free slots for ${b.doctorName} on ` +
      `${speakDate(
        b.date,
        today
      )}: ` +
      `${list(a.freeSlots)}`
    );
  }

  // --------------------------------------------------------------
  // SUGGESTED DAYS
  // --------------------------------------------------------------

  if (a?.suggestions?.length) {
    facts.push(
      `Next free days: ` +
      `${a.suggestions
        .map(
          (s) =>
            `${speakDate(
              s.date,
              today
            )} (${list(s.slots)})`
        )
        .join("; ")}`
    );
  }

  // --------------------------------------------------------------
  // CANCELLATION APPOINTMENT
  // --------------------------------------------------------------

  const cancellationAppointment =
    b.cancellationAppointment;

  const cancellationAppointmentFacts =
    cancellationAppointment
      ? `
Booking ID: ${cancellationAppointment.bookingId}
Patient: ${cancellationAppointment.patientName}
Treatment: ${cancellationAppointment.treatment}
Doctor: ${cancellationAppointment.doctorName}
Date: ${speakDate(
          cancellationAppointment.date,
          today
        )}
Time: ${speakTime(
          cancellationAppointment.time
        )}
`
      : "(no cancellation appointment found)";

  // --------------------------------------------------------------
  // PROMPT
  // --------------------------------------------------------------

  return `
You are Priya, the female phone receptionist of City Dental Clinic.

Speak simple, warm, natural English in 1-2 short sentences.
One question at a time.
No markdown, lists or emojis.

Today is ${weekdayOf(today)}, ${today} (India).
Tomorrow is ${addDays(
    today,
    1
  )}.

================================================
BOOKING STATE
================================================

The booking state is maintained by the system and is authoritative.

Never ask again for a field that is already filled.

Name: ${b.patientName || "-"}
Treatment: ${b.treatment || "-"}
Doctor: ${b.doctorName || "-"}
Date: ${
    b.date
      ? speakDate(
          b.date,
          today
        )
      : "-"
  }
Time: ${
    b.time
      ? speakTime(
          b.time
        )
      : "-"
  }
Email: ${b.patientEmail || "-"}

================================================
CANCELLATION STATE
================================================

Cancellation mode:
${b.cancellationMode ? "ACTIVE" : "INACTIVE"}

Cancellation Booking ID:
${b.cancellationBookingId || "-"}

Cancellation appointment details:
${cancellationAppointmentFacts}

Appointment details confirmed:
${
    b.cancellationDetailsConfirmed
      ? "YES"
      : "NO"
  }

Cancellation reason:
${b.cancellationReason || "-"}

Final cancellation confirmation pending:
${
    b.cancellationFinalConfirmationPending
      ? "YES"
      : "NO"
  }

================================================
NOTICE
================================================

${
    t.notices?.length
      ? `Tell the caller first: ${t.notices.join(" ")}`
      : "(none)"
  }

================================================
DATABASE FACTS
================================================

${facts.join("\n") || "(none)"}

================================================
YOUR NEXT ACTION
================================================

${nextAction(b, t)}

================================================
RULES
================================================

1. Do the NEXT ACTION and nothing else.

2. Use only the facts above.
Never invent doctors, slots, booking IDs or appointment details.

3. Say dates and times naturally.
For example: "tomorrow at 11 AM".
Never say dates as raw YYYY-MM-DD.

4. Never say a booking is confirmed unless NEXT ACTION says it is DONE.

5. The caller's email is required for appointment confirmation.

6. Take the email exactly as the caller says it.
Do NOT ask the caller to spell it letter by letter.

7. If the caller says the email or any booking detail is wrong,
the system has already updated it.
Read the COMPLETE updated summary again.

8. Never say an email address as raw text with "@".

Say email naturally, for example:
"agam2001 at gmail dot com".

9. DO NOT ask the caller for a WhatsApp number.
WhatsApp is not part of the current booking conversation.

10. Never invent or guess an email address.

11. BEFORE BOOKING CONFIRMATION:

When all required booking details are available and the email
has been verified, ALWAYS read the COMPLETE booking summary.

The summary must include:
name, email, treatment, doctor, date and time.

Then ask:
"Is everything correct?"

12. If the caller corrects ANY booking detail,
do not say the booking is confirmed.

Use the latest booking state and read the COMPLETE
UPDATED summary again.

13. Never skip the complete summary after a correction.

14. Do not book merely because the caller provided or corrected
a detail.

15. The booking should only proceed after the caller explicitly
confirms that the complete details are correct.

16. Never say "booked" or "confirmed" before the actual booking
process succeeds.

17. If the caller only says thanks or bye, close politely.

================================================
CANCELLATION RULES
================================================

18. If the caller wants to cancel an appointment,
follow this exact order.

First ask for the unique Booking ID.

19. The system will search the appointment using the Booking ID.

Do NOT ask for patient name, doctor name, date or time
to search for the appointment.

20. When the system finds the appointment,
read the appointment details:

patient name,
treatment,
doctor,
date,
time.

Then ask whether these details are correct.

21. Only after the caller confirms the appointment details,
ask for the cancellation reason.

22. After receiving the cancellation reason,
read the cancellation summary again.

The summary must include:
Booking ID,
patient name,
treatment,
doctor,
date,
time,
cancellation reason.

Then ask for FINAL confirmation.

23. Never cancel the appointment before FINAL confirmation.

24. Never say the appointment is cancelled unless the system
reports a successful cancellation.

25. Never invent or guess a Booking ID.

26. Never invent appointment details.

27. The cancellation tool is executed by the system only
after final confirmation.

Do not attempt to call cancelBooking yourself.

28. If the caller says the appointment details are wrong,
ask for the correct Booking ID again.

29. If cancellation fails, do not tell the caller it was cancelled.

30. If cancellation succeeds, tell the caller that:
- the appointment was cancelled successfully
- the cancellation email was sent
Then ask if they need anything else.
`;
};

// ================================================================
// RECENT MESSAGES
// ================================================================

const recent = (messages) => {
  const h = messages.slice(
    -HISTORY_MESSAGES
  );

  while (
    h.length &&
    (
      h[0].type ??
      h[0]._getType?.()
    ) === "tool"
  ) {
    h.shift();
  }

  return h;
};

// ================================================================
// FALLBACK REPLY
// ================================================================

const fallbackReply = (b, t) => {
  const r = t.bookingResult;

  const c = t.cancellationResult;

  // --------------------------------------------------------------
  // CANCELLATION SUCCESS
  // --------------------------------------------------------------

  if (c?.success) {
    return (
      `Your appointment with ` +
      `${c.doctorName} has been cancelled successfully. ` +
      `I have sent the cancellation email to your email address.`
    );
  }

  // --------------------------------------------------------------
  // CANCELLATION FAILED
  // --------------------------------------------------------------

  if (
    c &&
    !c.success
  ) {
    return (
      "Sorry, I could not cancel the appointment. " +
      "Please try again."
    );
  }

  // --------------------------------------------------------------
  // BOOKING SUCCESS
  // --------------------------------------------------------------

  if (r?.success) {
    return (
      `Your appointment with ${r.doctorName} ` +
      `is confirmed for ` +
      `${speakDate(
        r.date,
        t.today
      )} at ` +
      `${speakTime(
        r.time
      )}. ` +
      `I have sent the confirmation email to your email address.`
    );
  }

  // --------------------------------------------------------------
  // DEFAULT
  // --------------------------------------------------------------

  return (
    "Sorry, I had a small technical problem. " +
    "Could you please say that again?"
  );
};

// ================================================================
// AGENT NODE
// ================================================================

const callModel = async (state) => {
  console.log(
    "🧠 AGENT NODE STARTED"
  );

  const system =
    new SystemMessage(
      buildSystemPrompt(
        state.conversationState,
        state.turn
      )
    );

  const started =
    Date.now();

  try {
    // IMPORTANT:
    // Cancellation tool is NOT bound to the LLM.
    // Cancellation is executed only by cancelNode
    // after deterministic final confirmation.

    const response =
      await llmPlain.invoke([
        system,
        ...recent(
          state.messages
        ),
      ]);

    console.log(
      `⏱️ Groq LLM: ${
        Date.now() - started
      } ms`
    );

    console.log(
      "📝 Response content:",
      response.content
    );

    return {
      messages: [response],
    };
  } catch (error) {
    console.error(
      `❌ Groq failed after ${
        Date.now() - started
      } ms:`,
      error.message
    );

    return {
      messages: [
        new AIMessage(
          fallbackReply(
            state.conversationState,
            state.turn
          )
        ),
      ],
    };
  }
};

// ================================================================
// WORKFLOW
// ================================================================

const workflow =
  new StateGraph(AgentState)

    // ------------------------------------------------------------
    // NODES
    // ------------------------------------------------------------

    .addNode(
      "prepare",
      prepareNode
    )

    .addNode(
      "book",
      bookNode
    )

    .addNode(
      "cancel",
      cancelNode
    )

    .addNode(
      "agent",
      callModel
    )

    // ------------------------------------------------------------
    // START
    // ------------------------------------------------------------

    .addEdge(
      START,
      "prepare"
    )

    // ------------------------------------------------------------
    // PREPARE ROUTING
    // ------------------------------------------------------------

    .addConditionalEdges(
      "prepare",
      routeAfterPrepare,
      [
        "book",
        "cancel",
        "agent",
      ]
    )

    // ------------------------------------------------------------
    // BOOKING
    // ------------------------------------------------------------

    .addEdge(
      "book",
      "agent"
    )

    // ------------------------------------------------------------
    // CANCELLATION
    // ------------------------------------------------------------

    .addEdge(
      "cancel",
      "agent"
    )

    // ------------------------------------------------------------
    // NORMAL AGENT RESPONSE
    // ------------------------------------------------------------

    .addEdge(
      "agent",
      END
    );

// ================================================================
// COMPILE
// ================================================================

export const agent =
  workflow.compile();