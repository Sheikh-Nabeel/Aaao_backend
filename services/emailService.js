import nodemailer from 'nodemailer';

export const setupEmailService = () => {
  // Create a test account (for development only)
  const testAccount = {
    user: process.env.MAIL_USER || 'test@example.com', // Replace with your email
    pass: process.env.MAIL_PASS || 'testpass' // Replace with your email password
  };

  // Create reusable transporter object using the default SMTP transport
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com', // Replace with your SMTP host
    port: 587,
    secure: false, // true for 465, false for other ports
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });

  // Verify connection configuration
  transporter.verify((error, success) => {
    if (error) {
      console.error('Email service error:'.red, error);
    } else {
      console.log('✉️ Email server is ready to send messages'.green);
    }
  });

  return transporter;
};

export const sendEmail = async (transporter, mailOptions) => {
  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('Message sent: %s', info.messageId);
    return info;
  } catch (error) {
    console.error('Error sending email:'.red, error);
    throw error;
  }
};
