import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_APP_PASSWORD,
  },
});

export const sendBookingEmail = async ({
  bookingId,
  patientEmail,
  patientName,
  doctorName,
  treatment,
  date,
  time,
}) => {
  try {
    if (!patientEmail) {
      console.log(
        "⚠️ No patient email provided. Skipping email."
      );

      return {
        success: false,
        message: "Patient email is required.",
      };
    }

    const mailOptions = {
      from: `"City Dental Clinic" <${process.env.EMAIL_USER}>`,
      to: patientEmail,

      subject:
        "Dental Appointment Confirmation - City Dental Clinic",

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 10px;
        ">

          <h2 style="color: #2563eb;">
            City Dental Clinic
          </h2>

          <p>
            Hello <strong>${patientName}</strong>,
          </p>

          <p>
            Your dental appointment has been successfully booked.
          </p>

          <hr />

          <h3>Appointment Details</h3>
          <p>
            <strong>Booking ID:</strong> ${bookingId}
          </p>

          <p>
            <strong>Doctor:</strong> ${doctorName}
          </p>

          <p>
            <strong>Treatment:</strong> ${treatment}
          </p>

          <p>
            <strong>Date:</strong> ${date}
          </p>

          <p>
            <strong>Time:</strong> ${time}
          </p>

          <hr />

          <p>
            Please arrive a few minutes before your appointment.
          </p>

          <p>
            Thank you for choosing
            <strong>City Dental Clinic</strong>.
          </p>

          <br />

          <p style="color: #666;">
            This is an automated confirmation email from Priya,
            City Dental Clinic's AI assistant.
          </p>

        </div>
      `,
    };

    const info =
      await transporter.sendMail(mailOptions);

    console.log(
      "📧 Appointment email sent successfully"
    );

    console.log(
      "📧 Message ID:",
      info.messageId
    );

    console.log(
      "📧 Sent to:",
      patientEmail
    );

    return {
      success: true,
      messageId: info.messageId,
    };
  } catch (error) {
    console.error(
      "❌ Email sending failed:",
      error.message
    );

    return {
      success: false,
      message: error.message,
    };
  }
};