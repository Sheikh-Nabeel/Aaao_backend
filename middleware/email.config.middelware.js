import nodemailer from "nodemailer";

// Professional email configuration with anti-spam measures
export const transporter = nodemailer.createTransport({
  host: "mail.aaaogo.com", 
  port: 465, 
  secure: true, 
  auth: {
    user: "support@aaaogo.com",
    pass: "8rEQ*0fnn=nu",
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateLimit: 14, // Limit to 14 emails per second
  
  requireTLS: true,
  tls: {
    rejectUnauthorized: false
  },
  
  // Anti-spam headers
  headers: {
    'X-Priority': '1',
    'X-MSMail-Priority': 'High',
    'Importance': 'high',
    'X-Mailer': 'AAAO GO Mailer'
  }
});

// Verify transporter connection
transporter.verify(function(error, success) {
  if (error) {
    console.error('❌ Email transporter verification failed:', error.red);
  } else {
    console.log('✉️ Email server is ready to send messages'.green);
  }
});