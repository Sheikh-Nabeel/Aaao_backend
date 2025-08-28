import {
  Verification_Email_Template,
  Welcome_Email_Template,
  OTP_Email_Template,
  Password_Reset_OTP_Template,
  Booking_Confirmation_Template,
  Login_OTP_Template,
  KYC_Approval_Template,
  KYC_Rejection_Template,
  Driver_Approval_Template,
  Driver_Rejection_Template,
} from "../lips/email.template.js";
import { transporter } from "./email.config.middelware.js";
// import {
//   Verification_Email_Template,
//   Welcome_Email_Template,
// } from "../libs/email.template.js";

export const sendemailverification = async (email, verificationcode) => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <support@aaaogo.com>`,
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

export const sendKYCApprovalEmail = async (email, kycLevel, userName = "User") => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <support@aaaogo.com>`,
      to: email,
      subject: `KYC Level ${kycLevel} Approved - AAAO GO`,
      text: "Your KYC submission has been approved",
      html: KYC_Approval_Template
        .replace("{userName}", userName)
        .replace("{kycLevel}", kycLevel),
    });
    console.log("KYC approval email sent successfully:", response);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending KYC approval email:", error.message);
    throw new Error("Failed to send KYC approval email");
  }
};

export const sendKYCRejectionEmail = async (email, reason, userName = "User") => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <support@aaaogo.com>`,
      to: email,
      subject: "KYC Submission Update - AAAO GO",
      text: "Your KYC submission requires attention",
      html: KYC_Rejection_Template
        .replace("{userName}", userName)
        .replace("{rejectionReason}", reason || "No specific reason provided. Please ensure all documents are clear and meet our requirements."),
    });
    console.log("KYC rejection email sent successfully:", response);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending KYC rejection email:", error.message);
    throw new Error("Failed to send KYC rejection email");
  }
};

// Generate 6-digit OTP
export const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send general OTP email with anti-spam measures
export const sendOTPEmail = async (email, otpCode, purpose = "verification") => {
  try {
    const timestamp = new Date().toISOString();
    const messageId = `otp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await transporter.sendMail({
      from: {
        name: "AAAO GO Security",
        address: "support@aaaogo.com"
      },
      to: email,
      subject: `🔐 Your AAAO GO Security Code: ${otpCode}`,
      text: `Your AAAO GO security code is: ${otpCode}. This code expires in 10 minutes. Do not share this code with anyone.`,
      html: OTP_Email_Template
        .replace("{otpCode}", otpCode)
        .replace("{purpose}", purpose),
      
      // Anti-spam headers
      headers: {
        'Message-ID': `<${messageId}@aaaogo.com>`,
        'Date': new Date().toUTCString(),
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'AAAO GO Security System',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk',
        'List-Unsubscribe': '<mailto:support@aaaogo.com?subject=unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      
      // DKIM and SPF friendly
      dkim: {
        domainName: 'aaaogo.com',
        keySelector: 'default',
        privateKey: process.env.DKIM_PRIVATE_KEY || '',
        headerFieldNames: 'from:to:subject:date'
      }
    });
    
    console.log("OTP email sent successfully:", response.messageId);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending OTP email:", error.message);
    throw new Error("Failed to send OTP email");
  }
};

// Send password reset OTP with anti-spam measures
export const sendPasswordResetOTP = async (email, otpCode) => {
  try {
    const messageId = `pwd-reset-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await transporter.sendMail({
      from: {
        name: "AAAO GO Security",
        address: "support@aaaogo.com"
      },
      to: email,
      subject: `🔑 Password Reset Code: ${otpCode} - AAAO GO`,
      text: `Your AAAO GO password reset code is: ${otpCode}. This code expires in 10 minutes. If you didn't request this, please ignore this email.`,
      html: Password_Reset_OTP_Template.replace("{otpCode}", otpCode),
      
      // Anti-spam headers
      headers: {
        'Message-ID': `<${messageId}@aaaogo.com>`,
        'Date': new Date().toUTCString(),
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'AAAO GO Security System',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk',
        'List-Unsubscribe': '<mailto:support@aaaogo.com?subject=unsubscribe>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      
      // DKIM and SPF friendly
      dkim: {
        domainName: 'aaaogo.com',
        keySelector: 'default',
        privateKey: process.env.DKIM_PRIVATE_KEY || '',
        headerFieldNames: 'from:to:subject:date'
      }
    });
    
    console.log("Password reset OTP sent successfully:", response.messageId);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending password reset OTP:", error.message);
    throw new Error("Failed to send password reset OTP");
  }
};

// Send login OTP
export const sendLoginOTP = async (email, otpCode, loginDetails = {}) => {
  try {
    const {
      loginTime = new Date().toLocaleString(),
      deviceInfo = "Unknown Device",
      loginLocation = "Unknown Location"
    } = loginDetails;

    const response = await transporter.sendMail({
      from: `"AAAO GO" <support@aaaogo.com>`,
      to: email,
      subject: "Login Verification OTP - AAAO GO",
      text: `Your login OTP is: ${otpCode}`,
      html: Login_OTP_Template
        .replace("{otpCode}", otpCode)
        .replace("{loginTime}", loginTime)
        .replace("{deviceInfo}", deviceInfo)
        .replace("{loginLocation}", loginLocation),
    });
    console.log("Login OTP sent successfully:", response);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending login OTP:", error.message);
    throw new Error("Failed to send login OTP");
  }
};

// Send driver approval email
export const sendDriverApprovalEmail = async (email, driverName = "Driver") => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <support@aaaogo.com>`,
      to: email,
      subject: "Driver Application Approved - AAAO GO",
      text: "Your driver application has been approved",
      html: Driver_Approval_Template.replace("{driverName}", driverName),
    });
    console.log("Driver approval email sent successfully:", response);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending driver approval email:", error.message);
    throw new Error("Failed to send driver approval email");
  }
};

// Send driver rejection email
export const sendDriverRejectionEmail = async (email, reason, driverName = "Driver") => {
  try {
    const response = await transporter.sendMail({
      from: `"AAAO GO" <support@aaaogo.com>`,
      to: email,
      subject: "Driver Application Update - AAAO GO",
      text: "Your driver application requires attention",
      html: Driver_Rejection_Template
        .replace("{driverName}", driverName)
        .replace("{rejectionReason}", reason || "No specific reason provided. Please ensure all documents are valid and meet our requirements."),
    });
    console.log("Driver rejection email sent successfully:", response);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending driver rejection email:", error.message);
    throw new Error("Failed to send driver rejection email");
  }
};

// Send booking confirmation email
export const sendBookingConfirmation = async (email, bookingDetails) => {
  try {
    const {
      customerName,
      bookingId,
      serviceType,
      bookingDateTime,
      pickupLocation,
      dropLocation,
      totalFare
    } = bookingDetails;

    const response = await transporter.sendMail({
      from: `"AAAO GO" <support@aaaogo.com>`,
      to: email,
      subject: `Booking Confirmed - ${bookingId}`,
      text: `Your booking ${bookingId} has been confirmed.`,
      html: Booking_Confirmation_Template
        .replace("{customerName}", customerName || "Customer")
        .replace("{bookingId}", bookingId)
        .replace("{serviceType}", serviceType)
        .replace("{bookingDateTime}", bookingDateTime)
        .replace("{pickupLocation}", pickupLocation)
        .replace("{dropLocation}", dropLocation)
        .replace("{totalFare}", totalFare),
    });
    console.log("Booking confirmation email sent successfully:", response);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending booking confirmation email:", error.message);
    throw new Error("Failed to send booking confirmation email");
  }
};
