import { transporter } from "./email.config.middelware.js";

// Support Ticket Email Templates
const Support_Ticket_Created_Template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support Ticket Created</title>
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
        .ticket-info {
            background: #e7f3ff;
            border: 1px solid #b3d9ff;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .ticket-id {
            font-size: 18px;
            font-weight: bold;
            color: #013220;
            margin-bottom: 10px;
        }
        .priority-badge {
            display: inline-block;
            padding: 5px 12px;
            border-radius: 15px;
            font-size: 12px;
            font-weight: bold;
            text-transform: uppercase;
        }
        .priority-low { background: #d4edda; color: #155724; }
        .priority-medium { background: #fff3cd; color: #856404; }
        .priority-high { background: #f8d7da; color: #721c24; }
        .priority-urgent { background: #f5c6cb; color: #721c24; }
        .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
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
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            🎫 Support Ticket Created
        </div>
        <div class="content">
            <p>Hello {userName},</p>
            <p>Your support ticket has been successfully created and assigned to our support team.</p>
            
            <div class="ticket-info">
                <div class="ticket-id">Ticket ID: {ticketId}</div>
                <p><strong>Subject:</strong> {subject}</p>
                <p><strong>Priority:</strong> <span class="priority-badge priority-{priority}">{priority}</span></p>
                <p><strong>Category:</strong> {category}</p>
                <p><strong>Status:</strong> {status}</p>
            </div>
            
            <p>Our support team will review your ticket and respond within our standard response time based on the priority level.</p>
            
            <p><strong>Expected Response Times:</strong></p>
            <ul>
                <li>🔴 Urgent: Within 1 hour</li>
                <li>🟠 High: Within 4 hours</li>
                <li>🟡 Medium: Within 24 hours</li>
                <li>🟢 Low: Within 48 hours</li>
            </ul>
            
            <p>You can track the progress of your ticket by logging into your account or replying to this email.</p>
        </div>
        <div class="footer">
            <p>Thank you for using AAAO GO Support</p>
            <p>This is an automated message. Please do not reply directly to this email.</p>
        </div>
    </div>
</body>
</html>
`;

const Support_Ticket_Response_Template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>New Response to Your Support Ticket</title>
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
        .response-box {
            background: #f8f9fa;
            border-left: 4px solid #FFB800;
            padding: 20px;
            margin: 20px 0;
            border-radius: 0 8px 8px 0;
        }
        .ticket-info {
            background: #e7f3ff;
            border: 1px solid #b3d9ff;
            padding: 15px;
            border-radius: 8px;
            margin: 15px 0;
            font-size: 14px;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            💬 New Response to Your Ticket
        </div>
        <div class="content">
            <p>Hello {userName},</p>
            <p>You have received a new response to your support ticket.</p>
            
            <div class="ticket-info">
                <strong>Ticket ID:</strong> {ticketId}<br>
                <strong>Subject:</strong> {subject}<br>
                <strong>Responded by:</strong> {responderName}
            </div>
            
            <div class="response-box">
                <h4>Response:</h4>
                <p>{responseMessage}</p>
            </div>
            
            <p>You can reply to this ticket by logging into your account or responding to this email.</p>
        </div>
        <div class="footer">
            <p>Thank you for using AAAO GO Support</p>
            <p>This is an automated message. Please do not reply directly to this email.</p>
        </div>
    </div>
</body>
</html>
`;

const Support_Ticket_Status_Update_Template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support Ticket Status Update</title>
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
        .status-update {
            background: #fff8e1;
            border: 2px solid #FFB800;
            padding: 20px;
            border-radius: 8px;
            text-align: center;
            margin: 20px 0;
        }
        .status-badge {
            display: inline-block;
            padding: 8px 16px;
            border-radius: 20px;
            font-weight: bold;
            text-transform: uppercase;
            font-size: 14px;
        }
        .status-open { background: #d1ecf1; color: #0c5460; }
        .status-in-progress { background: #fff3cd; color: #856404; }
        .status-resolved { background: #d4edda; color: #155724; }
        .status-closed { background: #f8d7da; color: #721c24; }
        .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            📋 Ticket Status Update
        </div>
        <div class="content">
            <p>Hello {userName},</p>
            <p>The status of your support ticket has been updated.</p>
            
            <div class="status-update">
                <h3>Ticket ID: {ticketId}</h3>
                <p><strong>Subject:</strong> {subject}</p>
                <p><strong>New Status:</strong> <span class="status-badge status-{status}">{status}</span></p>
                {statusMessage}
            </div>
            
            <p>If you have any questions about this update, please feel free to respond to this ticket.</p>
        </div>
        <div class="footer">
            <p>Thank you for using AAAO GO Support</p>
            <p>This is an automated message. Please do not reply directly to this email.</p>
        </div>
    </div>
</body>
</html>
`;

const Support_Ticket_Assignment_Template = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support Ticket Assignment</title>
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
        .assignment-info {
            background: #e7f3ff;
            border: 1px solid #b3d9ff;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
        }
        .footer {
            background-color: #f8f9fa;
            padding: 20px;
            text-align: center;
            color: #6c757d;
            font-size: 14px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            👤 New Ticket Assignment
        </div>
        <div class="content">
            <p>Hello {agentName},</p>
            <p>A new support ticket has been assigned to you.</p>
            
            <div class="assignment-info">
                <h3>Ticket Details:</h3>
                <p><strong>Ticket ID:</strong> {ticketId}</p>
                <p><strong>Subject:</strong> {subject}</p>
                <p><strong>Priority:</strong> {priority}</p>
                <p><strong>Category:</strong> {category}</p>
                <p><strong>Customer:</strong> {customerName}</p>
                <p><strong>Created:</strong> {createdAt}</p>
            </div>
            
            <p>Please review the ticket details and respond according to the priority level.</p>
            <p>You can access the ticket through the admin panel or by clicking the link in your dashboard.</p>
        </div>
        <div class="footer">
            <p>AAAO GO Support System</p>
            <p>This is an automated message.</p>
        </div>
    </div>
</body>
</html>
`;

// Send ticket creation confirmation email
export const sendTicketCreatedEmail = async (email, ticketData, userName) => {
  try {
    const messageId = `ticket-created-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await transporter.sendMail({
      from: {
        name: "AAAO GO Support",
        address: "support@aaaogo.com"
      },
      to: email,
      subject: `🎫 Support Ticket Created - ${ticketData.ticketId}`,
      text: `Your support ticket ${ticketData.ticketId} has been created successfully. Subject: ${ticketData.subject}. Our team will respond based on the priority level.`,
      html: Support_Ticket_Created_Template
        .replace("{userName}", userName)
        .replace(/{ticketId}/g, ticketData.ticketId)
        .replace("{subject}", ticketData.subject)
        .replace(/{priority}/g, ticketData.priority)
        .replace("{category}", ticketData.category)
        .replace("{status}", ticketData.status),
      
      headers: {
        'Message-ID': `<${messageId}@aaaogo.com>`,
        'Date': new Date().toUTCString(),
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'AAAO GO Support System',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk'
      }
    });
    
    console.log("Ticket creation email sent successfully:", response.messageId);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending ticket creation email:", error.message);
    throw new Error("Failed to send ticket creation email");
  }
};

// Send ticket response notification email
export const sendTicketResponseEmail = async (email, ticketData, responseData, userName) => {
  try {
    const messageId = `ticket-response-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await transporter.sendMail({
      from: {
        name: "AAAO GO Support",
        address: "support@aaaogo.com"
      },
      to: email,
      subject: `💬 New Response - Ticket ${ticketData.ticketId}`,
      text: `You have received a new response to your support ticket ${ticketData.ticketId}. Response: ${responseData.message}`,
      html: Support_Ticket_Response_Template
        .replace("{userName}", userName)
        .replace(/{ticketId}/g, ticketData.ticketId)
        .replace("{subject}", ticketData.subject)
        .replace("{responderName}", responseData.responderName)
        .replace("{responseMessage}", responseData.message),
      
      headers: {
        'Message-ID': `<${messageId}@aaaogo.com>`,
        'Date': new Date().toUTCString(),
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'AAAO GO Support System',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk'
      }
    });
    
    console.log("Ticket response email sent successfully:", response.messageId);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending ticket response email:", error.message);
    throw new Error("Failed to send ticket response email");
  }
};

// Send ticket status update email
export const sendTicketStatusUpdateEmail = async (email, ticketData, userName, statusMessage = "") => {
  try {
    const messageId = `ticket-status-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const statusMessageHtml = statusMessage ? `<p><strong>Update Note:</strong> ${statusMessage}</p>` : "";
    
    const response = await transporter.sendMail({
      from: {
        name: "AAAO GO Support",
        address: "support@aaaogo.com"
      },
      to: email,
      subject: `📋 Status Update - Ticket ${ticketData.ticketId}`,
      text: `Your support ticket ${ticketData.ticketId} status has been updated to: ${ticketData.status}. ${statusMessage}`,
      html: Support_Ticket_Status_Update_Template
        .replace("{userName}", userName)
        .replace(/{ticketId}/g, ticketData.ticketId)
        .replace("{subject}", ticketData.subject)
        .replace(/{status}/g, ticketData.status)
        .replace("{statusMessage}", statusMessageHtml),
      
      headers: {
        'Message-ID': `<${messageId}@aaaogo.com>`,
        'Date': new Date().toUTCString(),
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'AAAO GO Support System',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk'
      }
    });
    
    console.log("Ticket status update email sent successfully:", response.messageId);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending ticket status update email:", error.message);
    throw new Error("Failed to send ticket status update email");
  }
};

// Send ticket assignment notification email to agent
export const sendTicketAssignmentEmail = async (agentEmail, ticketData, agentName, customerName) => {
  try {
    const messageId = `ticket-assignment-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await transporter.sendMail({
      from: {
        name: "AAAO GO Support System",
        address: "support@aaaogo.com"
      },
      to: agentEmail,
      subject: `👤 New Ticket Assignment - ${ticketData.ticketId}`,
      text: `A new support ticket ${ticketData.ticketId} has been assigned to you. Subject: ${ticketData.subject}. Priority: ${ticketData.priority}. Customer: ${customerName}`,
      html: Support_Ticket_Assignment_Template
        .replace("{agentName}", agentName)
        .replace(/{ticketId}/g, ticketData.ticketId)
        .replace("{subject}", ticketData.subject)
        .replace("{priority}", ticketData.priority)
        .replace("{category}", ticketData.category)
        .replace("{customerName}", customerName)
        .replace("{createdAt}", new Date(ticketData.createdAt).toLocaleString()),
      
      headers: {
        'Message-ID': `<${messageId}@aaaogo.com>`,
        'Date': new Date().toUTCString(),
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'AAAO GO Support System',
        'X-Auto-Response-Suppress': 'OOF, AutoReply',
        'Precedence': 'bulk'
      }
    });
    
    console.log("Ticket assignment email sent successfully:", response.messageId);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending ticket assignment email:", error.message);
    throw new Error("Failed to send ticket assignment email");
  }
};

// Send escalation notification email
export const sendTicketEscalationEmail = async (email, ticketData, userName, escalationReason) => {
  try {
    const messageId = `ticket-escalation-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const response = await transporter.sendMail({
      from: {
        name: "AAAO GO Support",
        address: "support@aaaogo.com"
      },
      to: email,
      subject: `🚨 Ticket Escalated - ${ticketData.ticketId}`,
      text: `Your support ticket ${ticketData.ticketId} has been escalated for priority handling. Reason: ${escalationReason}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
          <div style="background: #dc3545; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
            <h2>🚨 Ticket Escalated</h2>
          </div>
          <div style="padding: 30px;">
            <p>Hello ${userName},</p>
            <p>Your support ticket <strong>${ticketData.ticketId}</strong> has been escalated for priority handling.</p>
            <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <p><strong>Escalation Reason:</strong> ${escalationReason}</p>
              <p><strong>Subject:</strong> ${ticketData.subject}</p>
              <p><strong>Priority:</strong> ${ticketData.priority}</p>
            </div>
            <p>A senior support specialist will review your case and provide assistance as soon as possible.</p>
          </div>
          <div style="background: #f8f9fa; padding: 20px; text-align: center; color: #6c757d; border-radius: 0 0 8px 8px;">
            <p>AAAO GO Support Team</p>
          </div>
        </div>
      `,
      
      headers: {
        'Message-ID': `<${messageId}@aaaogo.com>`,
        'Date': new Date().toUTCString(),
        'X-Priority': '1',
        'X-MSMail-Priority': 'High',
        'Importance': 'high',
        'X-Mailer': 'AAAO GO Support System'
      }
    });
    
    console.log("Ticket escalation email sent successfully:", response.messageId);
    return { success: true, messageId: response.messageId };
  } catch (error) {
    console.error("Error sending ticket escalation email:", error.message);
    throw new Error("Failed to send ticket escalation email");
  }
};