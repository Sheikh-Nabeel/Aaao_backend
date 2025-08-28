export const Verification_Email_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Verify Your Email</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .verification-code {
              display: block;
              margin: 20px 0;
              font-size: 22px;
              color: #013220;
              background: #fff8e1;
              border: 1px dashed #FFB800;
              padding: 10px;
              text-align: center;
              border-radius: 5px;
              font-weight: bold;
              letter-spacing: 2px;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">Verify Your Email</div>
          <div class="content">
              <p>Hello,</p>
              <p>Thank you for signing up! Please confirm your email address by entering the code below:</p>
              <span class="verification-code">{verificationCode}</span>
              <p>If you did not create an account, no further action is required. If you have any questions, feel free to contact our support team.</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const KYC_Approval_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KYC Approved</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .approval-badge {
              background: #fff8e1;
              border: 2px solid #FFB800;
              padding: 20px;
              border-radius: 8px;
              text-align: center;
              margin: 20px 0;
              color: #013220;
              font-size: 18px;
              font-weight: bold;
          }
          .next-steps {
              background: #e7f3ff;
              border: 1px solid #b3d9ff;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #004085;
          }
          .button {
              display: inline-block;
              padding: 12px 25px;
              margin: 20px 0;
              background-color: #FFB800;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">✅ KYC Approved</div>
          <div class="content">
              <p>Hello {userName},</p>
              <div class="approval-badge">
                  🎉 Congratulations! Your KYC Level {kycLevel} has been approved.
              </div>
              <p>Your identity verification has been successfully completed. You can now access all features available for your KYC level.</p>
              <div class="next-steps">
                  <strong>📋 What's Next:</strong><br>
                  • Complete your profile setup<br>
                  • Start using AAAO GO services<br>
                  • Explore premium features<br>
                  • Submit higher KYC levels for additional benefits
              </div>
              <a href="${process.env.APP_URL}/dashboard" class="button">Access Dashboard</a>
              <p>Thank you for choosing AAAO GO. We're excited to have you on board!</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const KYC_Rejection_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>KYC Submission Update</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .rejection-notice {
              background: #fff8e1;
              border: 2px solid #FFB800;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              color: #013220;
          }
          .reason-box {
              background: #f8d7da;
              border: 1px solid #f5c6cb;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #721c24;
          }
          .resubmit-steps {
              background: #d1ecf1;
              border: 1px solid #bee5eb;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #0c5460;
          }
          .button {
              display: inline-block;
              padding: 12px 25px;
              margin: 20px 0;
              background-color: #FFB800;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">📋 KYC Submission Update</div>
          <div class="content">
              <p>Hello {userName},</p>
              <div class="rejection-notice">
                  ⚠️ Your KYC submission requires attention and needs to be resubmitted.
              </div>
              <p>We've reviewed your KYC submission and found some issues that need to be addressed before approval.</p>
              <div class="reason-box">
                  <strong>📝 Reason for Rejection:</strong><br>
                  {rejectionReason}
              </div>
              <div class="resubmit-steps">
                  <strong>🔄 How to Resubmit:</strong><br>
                  • Review the rejection reason carefully<br>
                  • Prepare corrected documents<br>
                  • Ensure all images are clear and readable<br>
                  • Submit through your dashboard
              </div>
              <a href="${process.env.APP_URL}/submit-kyc" class="button">Resubmit KYC</a>
              <p>If you have any questions about the rejection or need assistance, please contact our support team.</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const Driver_Approval_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Driver Application Approved</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .approval-badge {
              background: #fff8e1;
              border: 2px solid #FFB800;
              padding: 20px;
              border-radius: 8px;
              text-align: center;
              margin: 20px 0;
              color: #013220;
              font-size: 18px;
              font-weight: bold;
          }
          .driver-benefits {
              background: #e7f3ff;
              border: 1px solid #b3d9ff;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #004085;
          }
          .button {
              display: inline-block;
              padding: 12px 25px;
              margin: 20px 0;
              background-color: #FFB800;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">🚗 Driver Application Approved</div>
          <div class="content">
              <p>Hello {driverName},</p>
              <div class="approval-badge">
                  🎉 Congratulations! Your driver application has been approved.
              </div>
              <p>Welcome to the AAAO GO driver community! You can now start accepting ride requests and earning money.</p>
              <div class="driver-benefits">
                  <strong>🌟 Driver Benefits:</strong><br>
                  • Flexible working hours<br>
                  • Competitive earnings<br>
                  • Weekly payouts<br>
                  • 24/7 driver support<br>
                  • Performance bonuses
              </div>
              <a href="${process.env.APP_URL}/driver-dashboard" class="button">Start Driving</a>
              <p>Download the driver app and complete your onboarding to start receiving ride requests.</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const Driver_Rejection_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Driver Application Update</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .rejection-notice {
              background: #fff8e1;
              border: 2px solid #FFB800;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              color: #013220;
          }
          .reason-box {
              background: #f8d7da;
              border: 1px solid #f5c6cb;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #721c24;
          }
          .reapply-steps {
              background: #d1ecf1;
              border: 1px solid #bee5eb;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #0c5460;
          }
          .button {
              display: inline-block;
              padding: 12px 25px;
              margin: 20px 0;
              background-color: #FFB800;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">📋 Driver Application Update</div>
          <div class="content">
              <p>Hello {driverName},</p>
              <div class="rejection-notice">
                  ⚠️ Your driver application requires attention and needs to be resubmitted.
              </div>
              <p>Thank you for your interest in becoming an AAAO GO driver. After reviewing your application, we found some areas that need improvement.</p>
              <div class="reason-box">
                  <strong>📝 Reason for Rejection:</strong><br>
                  {rejectionReason}
              </div>
              <div class="reapply-steps">
                  <strong>🔄 How to Reapply:</strong><br>
                  • Address the issues mentioned above<br>
                  • Ensure all documents are valid and clear<br>
                  • Complete any missing requirements<br>
                  • Submit a new application
              </div>
              <a href="${process.env.APP_URL}/driver-application" class="button">Reapply Now</a>
              <p>We encourage you to reapply once you've addressed the mentioned issues. Our support team is here to help if you have any questions.</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const OTP_Email_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your AAAO GO Security Code</title>
      <style>
          body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f8f9fa;
              color: #333;
          }
          .container {
              max-width: 600px;
              margin: 20px auto;
              background: #ffffff;
              border-radius: 12px;
              box-shadow: 0 2px 10px rgba(0, 0, 0, 0.08);
              overflow: hidden;
              border: 1px solid #e9ecef;
          }
          .header {
              background: linear-gradient(135deg, #013220 0%, #025a3a 100%);
              color: white;
              padding: 25px 20px;
              text-align: center;
              font-size: 24px;
              font-weight: 600;
          }
          .content {
              padding: 30px 25px;
              color: #333;
              line-height: 1.6;
          }
          .otp-code {
              display: block;
              margin: 25px 0;
              font-size: 32px;
              color: #013220;
              background: linear-gradient(135deg, #fff8e1 0%, #fff3cd 100%);
              border: 3px solid #FFB800;
              padding: 20px;
              text-align: center;
              border-radius: 12px;
              font-weight: 700;
              letter-spacing: 4px;
              font-family: 'Courier New', monospace;
          }
          .expiry-notice {
              background: #e3f2fd;
              border: 1px solid #bbdefb;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              color: #1565c0;
              text-align: center;
              font-weight: 600;
          }
          .security-notice {
              background: #fff3e0;
              border: 1px solid #ffcc02;
              padding: 15px;
              border-radius: 8px;
              margin: 20px 0;
              color: #e65100;
          }
          .footer {
              background-color: #f8f9fa;
              padding: 20px;
              text-align: center;
              color: #6c757d;
              font-size: 13px;
              border-top: 1px solid #e9ecef;
          }
          .company-info {
              margin-top: 15px;
              font-size: 11px;
              color: #adb5bd;
          }
          p {
              margin: 0 0 15px;
          }
          .highlight {
              color: #013220;
              font-weight: 600;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">
              🔐 AAAO GO Security Code
          </div>
          <div class="content">
              <p>Hello,</p>
              <p>You have requested a security code for <span class="highlight">{purpose}</span>. Please use the code below to complete your verification:</p>
              
              <span class="otp-code">{otpCode}</span>
              
              <div class="expiry-notice">
                  ⏰ This security code will expire in 10 minutes
              </div>
              
              <div class="security-notice">
                  <strong>🔒 Security Notice:</strong><br>
                  • Never share this code with anyone<br>
                  • AAAO GO will never ask for your code via phone or email<br>
                  • If you didn't request this code, please ignore this email
              </div>
              
              <p>If you need assistance, please contact our support team at <a href="mailto:support@aaaogo.com">support@aaaogo.com</a></p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
              <div class="company-info">
                  AAAO GO<br>
                  Transportation Services<br>
                  <a href="mailto:support@aaaogo.com">support@aaaogo.com</a>
              </div>
          </div>
      </div>
  </body>
  </html>
`;

export const Password_Reset_OTP_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset OTP</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .otp-code {
              display: block;
              margin: 20px 0;
              font-size: 28px;
              color: #013220;
              background: #fff8e1;
              border: 2px solid #FFB800;
              padding: 15px;
              text-align: center;
              border-radius: 8px;
              font-weight: bold;
              letter-spacing: 3px;
          }
          .security-notice {
              background: #d1ecf1;
              border: 1px solid #bee5eb;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #0c5460;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">🔒 Password Reset Request</div>
          <div class="content">
              <p>Hello,</p>
              <p>We received a request to reset your password. Use the OTP code below to proceed:</p>
              <span class="otp-code">{otpCode}</span>
              <div class="security-notice">
                  <strong>🛡️ Security Notice:</strong><br>
                  • This code expires in 10 minutes<br>
                  • If you didn't request this, please secure your account immediately<br>
                  • Never share this code with anyone
              </div>
              <p>After entering this code, you'll be able to create a new password for your account.</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const Booking_Confirmation_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .booking-details {
              background: #f8f9fa;
              border: 1px solid #dee2e6;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
          }
          .detail-row {
              display: flex;
              justify-content: space-between;
              margin: 10px 0;
              padding: 5px 0;
              border-bottom: 1px solid #eee;
          }
          .detail-label {
              font-weight: bold;
              color: #495057;
          }
          .detail-value {
              color: #FFB800;
              font-weight: bold;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">✅ Booking Confirmed</div>
          <div class="content">
              <p>Hello {customerName},</p>
              <p>Your booking has been confirmed! Here are the details:</p>
              <div class="booking-details">
                  <div class="detail-row">
                      <span class="detail-label">Booking ID:</span>
                      <span class="detail-value">{bookingId}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Service:</span>
                      <span class="detail-value">{serviceType}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Date & Time:</span>
                      <span class="detail-value">{bookingDateTime}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Pickup Location:</span>
                      <span class="detail-value">{pickupLocation}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Drop Location:</span>
                      <span class="detail-value">{dropLocation}</span>
                  </div>
                  <div class="detail-row">
                      <span class="detail-label">Total Fare:</span>
                      <span class="detail-value">₹{totalFare}</span>
                  </div>
              </div>
              <p>Your driver will contact you shortly. You can track your ride in real-time through the AAAO GO app.</p>
              <p>Thank you for choosing AAAO GO!</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const Login_OTP_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Login OTP</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #6F42C1;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              color: #333;
              line-height: 1.8;
          }
          .otp-code {
              display: block;
              margin: 20px 0;
              font-size: 28px;
              color: #6F42C1;
              background: #f3f0ff;
              border: 2px solid #6F42C1;
              padding: 15px;
              text-align: center;
              border-radius: 8px;
              font-weight: bold;
              letter-spacing: 3px;
          }
          .login-info {
              background: #e7f3ff;
              border: 1px solid #b3d9ff;
              padding: 15px;
              border-radius: 5px;
              margin: 15px 0;
              color: #004085;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">🔐 Login Verification</div>
          <div class="content">
              <p>Hello,</p>
              <p>Someone is trying to log into your AAAO GO account. Use the OTP below to complete your login:</p>
              <span class="otp-code">{otpCode}</span>
              <div class="login-info">
                  <strong>📱 Login Details:</strong><br>
                  • Time: {loginTime}<br>
                  • Device: {deviceInfo}<br>
                  • Location: {loginLocation}
              </div>
              <p>If this wasn't you, please secure your account immediately and contact our support team.</p>
              <p><strong>Note:</strong> This OTP will expire in 5 minutes for security purposes.</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;

export const Welcome_Email_Template = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to AAAO GO</title>
      <style>
          body {
              font-family: Arial, sans-serif;
              margin: 0;
              padding: 0;
              background-color: #f4f4f4;
              color: #333;
          }
          .container {
              max-width: 600px;
              margin: 30px auto;
              background: #ffffff;
              border-radius: 8px;
              box-shadow: 0 4px 15px rgba(0, 0, 0, 0.1);
              overflow: hidden;
              border: 1px solid #ddd;
          }
          .header {
              background-color: #013220;
              color: white;
              padding: 20px;
              text-align: center;
              font-size: 26px;
              font-weight: bold;
          }
          .content {
              padding: 25px;
              line-height: 1.8;
          }
          .welcome-message {
              font-size: 18px;
              margin: 20px 0;
          }
          .button {
              display: inline-block;
              padding: 12px 25px;
              margin: 20px 0;
              background-color: #FFB800;
              color: white;
              text-decoration: none;
              border-radius: 5px;
              text-align: center;
              font-size: 16px;
              font-weight: bold;
              transition: background-color 0.3s;
          }
          .button:hover {
              background-color: #013220;
          }
          .footer {
              background-color: #f4f4f4;
              padding: 15px;
              text-align: center;
              color: #777;
              font-size: 12px;
              border-top: 1px solid #ddd;
          }
          p {
              margin: 0 0 15px;
          }
      </style>
  </head>
  <body>
      <div class="container">
          <div class="header">Welcome to AAAO GO!</div>
          <div class="content">
              <p class="welcome-message">Hello {name},</p>
              <p>We’re thrilled to have you join us! Your registration was successful, and we’re committed to providing you with the best experience possible.</p>
              <p>Here’s how you can get started:</p>
              <ul>
                  <li>Explore our features and customize your experience.</li>
                  <li>Stay informed by checking out our blog for the latest updates and tips.</li>
                  <li>Reach out to our support team if you have any questions or need assistance.</li>
              </ul>
              <a href="${process.env.APP_URL}" class="button">Get Started</a>
              <p>If you need any help, don’t hesitate to contact us. We’re here to support you every step of the way.</p>
          </div>
          <div class="footer">
              <p>&copy; ${new Date().getFullYear()} AAAO GO. All rights reserved.</p>
          </div>
      </div>
  </body>
  </html>
`;
