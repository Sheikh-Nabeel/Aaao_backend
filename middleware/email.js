import {
  Verification_Email_Template,
  Welcome_Email_Template,
} from "../lips/email.template.js";
import { transporter } from "./email.config.middleware.js";
// import {
//   Verification_Email_Template,
//   Welcome_Email_Template,
// } from "../libs/email.template.js";

export const sendemailverification = async (email, verificationcode) => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <codesvistaaitzaz@gmail.com>`,
      to: email,
      subject: "Verify Your Email to Use AAAO GO App",
      text: "Verify your email",
      html: Verification_Email_Template.replace(
        "{verificationCode}",
        verificationcode
      ),
    });
    console.log("Verification email sent successfully:", response);
  } catch (error) {
    console.error("Error sending verification email:", error.message);
    throw new Error("Failed to send verification email");
  }
};

export const sendKYCApprovalEmail = async (email, kycLevel) => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <codesvistaaitzaz@gmail.com>`,
      to: email,
      subject: `KYC Level ${kycLevel} Approved`,
      text: "Your KYC submission has been approved",
      html: Welcome_Email_Template.replace("{name}", "User").replace(
        "Your registration was successful",
        `Your KYC Level ${kycLevel} submission has been approved. You can now access additional features.`
      ),
    });
    console.log("KYC approval email sent successfully:", response);
  } catch (error) {
    console.error("Error sending KYC approval email:", error.message);
    throw new Error("Failed to send KYC approval email");
  }
};

export const sendKYCRejectionEmail = async (email, reason) => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <codesvistaaitzaz@gmail.com>`,
      to: email,
      subject: "KYC Submission Rejected",
      text: "Your KYC submission was rejected",
      html: Welcome_Email_Template.replace("{name}", "User").replace(
        "Your registration was successful",
        `Your KYC submission was rejected. Reason: ${
          reason || "No reason provided"
        }. Please resubmit with the required corrections.`
      ),
    });
    console.log("KYC rejection email sent successfully:", response);
  } catch (error) {
    console.error("Error sending KYC rejection email:", error.message);
    throw new Error("Failed to send KYC rejection email");
  }
};
