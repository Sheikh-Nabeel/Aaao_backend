import SupportTicket from "../models/supportTicketModel.js";
import TicketResponse from "../models/ticketResponseModel.js";
import User from "../models/userModel.js";
import asyncHandler from "express-async-handler";
import {
  sendTicketCreatedEmail,
  sendTicketResponseEmail,
  sendTicketStatusUpdateEmail,
  sendTicketAssignmentEmail,
  sendTicketEscalationEmail
} from "../middleware/supportTicketEmail.js";
import mongoose from "mongoose";
import path from "path";
import fs from "fs";

// Ensure uploads folder exists for ticket attachments
const ticketUploadsDir = path.join(process.cwd(), "uploads", "tickets");
if (!fs.existsSync(ticketUploadsDir)) {
  fs.mkdirSync(ticketUploadsDir, { recursive: true });
}

// @desc    Create a new support ticket
// @route   POST /api/support/tickets
// @access  Private (Authenticated users)
const createTicket = asyncHandler(async (req, res) => {
  const { subject, description, priority, category } = req.body;
  const userId = req.user._id;

  // Validate required fields
  if (!subject || !description) {
    res.status(400);
    throw new Error("Subject and description are required");
  }

  // Validate priority and category if provided
  const validPriorities = ["low", "medium", "high", "urgent"];
  const validCategories = [
    "technical",
    "billing",
    "account",
    "booking",
    "payment",
    "driver",
    "vehicle",
    "mlm",
    "general",
    "other"
  ];

  if (priority && !validPriorities.includes(priority)) {
    res.status(400);
    throw new Error("Invalid priority level");
  }

  if (category && !validCategories.includes(category)) {
    res.status(400);
    throw new Error("Invalid category");
  }

  try {
    const ticket = await SupportTicket.create({
      user: userId,
      subject: subject.trim(),
      description: description.trim(),
      priority: priority || "medium",
      category: category || "general",
      lastUpdatedBy: userId,
    });

    // Populate user information
    await ticket.populate("user", "firstName lastName email phoneNumber");

    // Send email notification to user
    try {
      const user = await User.findById(userId).select('firstName lastName email');
      if (user && user.email) {
        await sendTicketCreatedEmail(
          user.email,
          {
            ticketId: ticket.ticketId,
            subject: ticket.subject,
            priority: ticket.priority,
            category: ticket.category,
            status: ticket.status
          },
          `${user.firstName} ${user.lastName}`
        );
      }
    } catch (emailError) {
      console.error('Failed to send ticket creation email:', emailError.message);
      // Don't fail the ticket creation if email fails
    }

    res.status(201).json({
      success: true,
      message: "Support ticket created successfully",
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to create ticket: ${error.message}`);
  }
});

// @desc    Get all tickets (Admin/Agent view)
// @route   GET /api/support/tickets
// @access  Private (Admin/Agent only)
const getAllTickets = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    priority,
    category,
    assignedAgent,
    search,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;

  // Build filter object
  const filter = {};
  
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;
  if (assignedAgent) filter.assignedAgent = assignedAgent;
  
  // Add search functionality
  if (search) {
    filter.$or = [
      { subject: { $regex: search, $options: "i" } },
      { description: { $regex: search, $options: "i" } },
      { ticketId: { $regex: search, $options: "i" } },
    ];
  }

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tickets = await SupportTicket.find(filter)
      .populate("user", "firstName lastName email phoneNumber")
      .populate("assignedAgent", "firstName lastName email")
      .populate("lastUpdatedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTickets = await SupportTicket.countDocuments(filter);
    const totalPages = Math.ceil(totalTickets / parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Tickets retrieved successfully",
      data: {
        tickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalTickets,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to retrieve tickets: ${error.message}`);
  }
});

// @desc    Get user's own tickets
// @route   GET /api/support/my-tickets
// @access  Private (Authenticated users)
const getUserTickets = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    status,
    priority,
    category,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = req.query;
  
  const userId = req.user._id;

  // Build filter object
  const filter = { user: userId };
  
  if (status) filter.status = status;
  if (priority) filter.priority = priority;
  if (category) filter.category = category;

  // Build sort object
  const sort = {};
  sort[sortBy] = sortOrder === "desc" ? -1 : 1;

  try {
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const tickets = await SupportTicket.find(filter)
      .populate("assignedAgent", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTickets = await SupportTicket.countDocuments(filter);
    const totalPages = Math.ceil(totalTickets / parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Your tickets retrieved successfully",
      data: {
        tickets,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalTickets,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to retrieve your tickets: ${error.message}`);
  }
});

// @desc    Get single ticket by ID
// @route   GET /api/support/tickets/:ticketId
// @access  Private (Owner or Admin/Agent)
const getTicketById = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const userId = req.user._id;
  const userRole = req.user.role;

  try {
    const ticket = await SupportTicket.findOne({
      $or: [
        { _id: ticketId },
        { ticketId: ticketId }
      ]
    })
      .populate("user", "firstName lastName email phoneNumber")
      .populate("assignedAgent", "firstName lastName email")
      .populate("lastUpdatedBy", "firstName lastName")
      .populate("escalatedTo", "firstName lastName email");

    if (!ticket) {
      res.status(404);
      throw new Error("Ticket not found");
    }

    // Check if user has permission to view this ticket
    const isOwner = ticket.user._id.toString() === userId.toString();
    const isAdminOrAgent = ["admin", "superadmin", "agent"].includes(userRole);
    const isAssignedAgent = ticket.assignedAgent && ticket.assignedAgent._id.toString() === userId.toString();

    if (!isOwner && !isAdminOrAgent && !isAssignedAgent) {
      res.status(403);
      throw new Error("Access denied: You don't have permission to view this ticket");
    }

    // Get ticket responses
    const responses = await TicketResponse.find({ ticket: ticket._id })
      .populate("respondent", "firstName lastName email role")
      .populate("editedBy", "firstName lastName")
      .sort({ createdAt: 1 });

    res.status(200).json({
      success: true,
      message: "Ticket retrieved successfully",
      data: {
        ticket,
        responses,
      },
    });
  } catch (error) {
    if (error.message.includes("Access denied") || error.message.includes("not found")) {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to retrieve ticket: ${error.message}`);
  }
});

// @desc    Update ticket status
// @route   PATCH /api/support/tickets/:ticketId/status
// @access  Private (Admin/Agent only)
const updateTicketStatus = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { status, internalNote } = req.body;
  const userId = req.user._id;

  const validStatuses = ["open", "in-progress", "resolved", "closed"];
  
  if (!status || !validStatuses.includes(status)) {
    res.status(400);
    throw new Error("Valid status is required (open, in-progress, resolved, closed)");
  }

  try {
    const ticket = await SupportTicket.findOne({
      $or: [
        { _id: ticketId },
        { ticketId: ticketId }
      ]
    });

    if (!ticket) {
      res.status(404);
      throw new Error("Ticket not found");
    }

    const oldStatus = ticket.status;
    ticket.status = status;
    ticket.lastUpdatedBy = userId;

    // Add internal note if provided
    if (internalNote) {
      ticket.internalNotes.push({
        note: internalNote.trim(),
        addedBy: userId,
      });
    }

    await ticket.save();

    // Create system response for status change
    await TicketResponse.create({
      ticket: ticket._id,
      respondent: userId,
      message: `Ticket status changed from "${oldStatus}" to "${status}"`,
      responseType: "system",
      isAutomated: true,
      automationTrigger: "status_change",
    });

    await ticket.populate("user", "firstName lastName email");
    await ticket.populate("assignedAgent", "firstName lastName email");
    await ticket.populate("lastUpdatedBy", "firstName lastName");

    // Send email notification to user about status update
    try {
      const user = await User.findById(ticket.user).select('firstName lastName email');
      if (user && user.email) {
        await sendTicketStatusUpdateEmail(
          user.email,
          {
            ticketId: ticket.ticketId,
            subject: ticket.subject,
            status: ticket.status
          },
          `${user.firstName} ${user.lastName}`,
          `Your ticket status has been updated to ${status}`
        );
      }
    } catch (emailError) {
      console.error('Failed to send status update email:', emailError.message);
      // Don't fail the status update if email fails
    }

    res.status(200).json({
      success: true,
      message: "Ticket status updated successfully",
      data: {
        ticket,
      },
    });
  } catch (error) {
    if (error.message.includes("not found")) {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to update ticket status: ${error.message}`);
  }
});

// @desc    Assign ticket to agent
// @route   PATCH /api/support/tickets/:ticketId/assign
// @access  Private (Admin only)
const assignTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { agentId, internalNote } = req.body;
  const userId = req.user._id;

  if (!agentId) {
    res.status(400);
    throw new Error("Agent ID is required");
  }

  try {
    // Verify agent exists and has appropriate role
    const agent = await User.findById(agentId);
    if (!agent) {
      res.status(404);
      throw new Error("Agent not found");
    }

    if (!["admin", "superadmin", "agent"].includes(agent.role)) {
      res.status(400);
      throw new Error("User is not authorized to be assigned as an agent");
    }

    const ticket = await SupportTicket.findOne({
      $or: [
        { _id: ticketId },
        { ticketId: ticketId }
      ]
    });

    if (!ticket) {
      res.status(404);
      throw new Error("Ticket not found");
    }

    const previousAgent = ticket.assignedAgent;
    ticket.assignedAgent = agentId;
    ticket.lastUpdatedBy = userId;
    
    // Add internal note if provided
    if (internalNote) {
      ticket.internalNotes.push({
        note: internalNote.trim(),
        addedBy: userId,
      });
    }

    await ticket.save();

    // Create system response for assignment
    const assignmentMessage = previousAgent 
      ? `Ticket reassigned from ${previousAgent} to ${agent.firstName} ${agent.lastName}`
      : `Ticket assigned to ${agent.firstName} ${agent.lastName}`;

    await TicketResponse.create({
      ticket: ticket._id,
      respondent: userId,
      message: assignmentMessage,
      responseType: "system",
      isAutomated: true,
      automationTrigger: "assignment",
    });

    await ticket.populate("user", "firstName lastName email");
    await ticket.populate("assignedAgent", "firstName lastName email");
    await ticket.populate("lastUpdatedBy", "firstName lastName");

    // Send email notification to assigned agent
    try {
      const assignedAgent = await User.findById(agentId).select('firstName lastName email');
      const customer = await User.findById(ticket.user).select('firstName lastName');
      
      if (assignedAgent && assignedAgent.email) {
        await sendTicketAssignmentEmail(
          assignedAgent.email,
          {
            ticketId: ticket.ticketId,
            subject: ticket.subject,
            priority: ticket.priority,
            category: ticket.category,
            createdAt: ticket.createdAt
          },
          `${assignedAgent.firstName} ${assignedAgent.lastName}`,
          `${customer.firstName} ${customer.lastName}`
        );
      }
    } catch (emailError) {
      console.error('Failed to send assignment email:', emailError.message);
      // Don't fail the assignment if email fails
    }

    res.status(200).json({
      success: true,
      message: "Ticket assigned successfully",
      data: {
        ticket,
      },
    });
  } catch (error) {
    if (error.message.includes("not found") || error.message.includes("not authorized")) {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to assign ticket: ${error.message}`);
  }
});

// @desc    Add response to ticket
// @route   POST /api/support/tickets/:ticketId/responses
// @access  Private (Owner, Admin, or Assigned Agent)
const addTicketResponse = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { message, isInternal = false } = req.body;
  const userId = req.user._id;
  const userRole = req.user.role;

  if (!message || message.trim().length === 0) {
    res.status(400);
    throw new Error("Message is required");
  }

  try {
    const ticket = await SupportTicket.findOne({
      $or: [
        { _id: ticketId },
        { ticketId: ticketId }
      ]
    });

    if (!ticket) {
      res.status(404);
      throw new Error("Ticket not found");
    }

    // Check permissions
    const isOwner = ticket.user.toString() === userId.toString();
    const isAdminOrAgent = ["admin", "superadmin", "agent"].includes(userRole);
    const isAssignedAgent = ticket.assignedAgent && ticket.assignedAgent.toString() === userId.toString();

    if (!isOwner && !isAdminOrAgent && !isAssignedAgent) {
      res.status(403);
      throw new Error("Access denied: You don't have permission to respond to this ticket");
    }

    // Determine response type
    let responseType = "customer";
    if (isAdminOrAgent || isAssignedAgent) {
      responseType = isInternal ? "internal" : "agent";
    }

    // Only agents/admins can create internal responses
    if (isInternal && !isAdminOrAgent && !isAssignedAgent) {
      res.status(403);
      throw new Error("Only agents and admins can create internal responses");
    }

    const response = await TicketResponse.create({
      ticket: ticket._id,
      respondent: userId,
      message: message.trim(),
      responseType,
      isInternal,
    });

    // Update ticket's last updated info
    ticket.lastUpdatedBy = userId;
    await ticket.save();

    await response.populate("respondent", "firstName lastName email role");

    // Send email notification to user about new response
    try {
      const user = await User.findById(ticket.user).select('firstName lastName email');
      const responder = await User.findById(userId).select('firstName lastName');
      
      if (user && user.email && !isInternal) {
        await sendTicketResponseEmail(
          user.email,
          {
            ticketId: ticket.ticketId,
            subject: ticket.subject
          },
          {
            message: message,
            responderName: responder ? `${responder.firstName} ${responder.lastName}` : 'Support Team'
          },
          `${user.firstName} ${user.lastName}`
        );
      }
    } catch (emailError) {
      console.error('Failed to send response email:', emailError.message);
      // Don't fail the response if email fails
    }

    res.status(201).json({
      success: true,
      message: "Response added successfully",
      data: {
        response,
      },
    });
  } catch (error) {
    if (error.message.includes("Access denied") || error.message.includes("not found")) {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to add response: ${error.message}`);
  }
});

// @desc    Get ticket statistics
// @route   GET /api/support/statistics
// @access  Private (Admin/Agent only)
const getTicketStatistics = asyncHandler(async (req, res) => {
  try {
    const stats = await SupportTicket.getTicketStats();
    const agentWorkload = await SupportTicket.getAgentWorkload();
    
    // Additional statistics
    const totalTickets = await SupportTicket.countDocuments();
    const openTickets = await SupportTicket.countDocuments({ status: "open" });
    const unassignedTickets = await SupportTicket.countDocuments({ 
      assignedAgent: null,
      status: { $in: ["open", "in-progress"] }
    });
    
    // Average resolution time (in hours)
    const resolvedTickets = await SupportTicket.find({
      status: "resolved",
      actualResolutionTime: { $ne: null }
    }).select("actualResolutionTime");
    
    const avgResolutionTime = resolvedTickets.length > 0 
      ? resolvedTickets.reduce((sum, ticket) => sum + ticket.actualResolutionTime, 0) / resolvedTickets.length / 60 // Convert to hours
      : 0;

    res.status(200).json({
      success: true,
      message: "Statistics retrieved successfully",
      data: {
        overview: {
          totalTickets,
          openTickets,
          unassignedTickets,
          avgResolutionTimeHours: Math.round(avgResolutionTime * 100) / 100,
        },
        ...stats,
        agentWorkload,
      },
    });
  } catch (error) {
    res.status(500);
    throw new Error(`Failed to retrieve statistics: ${error.message}`);
  }
});

// @desc    Escalate ticket
// @route   PATCH /api/support/tickets/:ticketId/escalate
// @access  Private (Admin/Agent only)
const escalateTicket = asyncHandler(async (req, res) => {
  const { ticketId } = req.params;
  const { escalateTo, reason } = req.body;
  const userId = req.user._id;

  if (!escalateTo || !reason) {
    res.status(400);
    throw new Error("Escalation target and reason are required");
  }

  try {
    // Verify escalation target exists and has appropriate role
    const escalationTarget = await User.findById(escalateTo);
    if (!escalationTarget) {
      res.status(404);
      throw new Error("Escalation target not found");
    }

    if (!["admin", "superadmin"].includes(escalationTarget.role)) {
      res.status(400);
      throw new Error("Can only escalate to admin or superadmin users");
    }

    const ticket = await SupportTicket.findOne({
      $or: [
        { _id: ticketId },
        { ticketId: ticketId }
      ]
    });

    if (!ticket) {
      res.status(404);
      throw new Error("Ticket not found");
    }

    ticket.isEscalated = true;
    ticket.escalatedAt = new Date();
    ticket.escalatedTo = escalateTo;
    ticket.priority = "urgent"; // Auto-escalate priority
    ticket.lastUpdatedBy = userId;
    
    // Add internal note for escalation
    ticket.internalNotes.push({
      note: `Ticket escalated to ${escalationTarget.firstName} ${escalationTarget.lastName}. Reason: ${reason}`,
      addedBy: userId,
    });

    await ticket.save();

    // Create system response for escalation
    await TicketResponse.create({
      ticket: ticket._id,
      respondent: userId,
      message: `Ticket escalated to ${escalationTarget.firstName} ${escalationTarget.lastName}`,
      responseType: "system",
      isAutomated: true,
      automationTrigger: "escalation",
    });

    await ticket.populate("user", "firstName lastName email");
    await ticket.populate("assignedAgent", "firstName lastName email");
    await ticket.populate("escalatedTo", "firstName lastName email");
    await ticket.populate("lastUpdatedBy", "firstName lastName");

    // Send email notification to user about escalation
    try {
      const user = await User.findById(ticket.user).select('firstName lastName email');
      if (user && user.email) {
        await sendTicketEscalationEmail(
          user.email,
          {
            ticketId: ticket.ticketId,
            subject: ticket.subject,
            priority: ticket.priority
          },
          `${user.firstName} ${user.lastName}`,
          reason || 'Ticket requires specialized attention'
        );
      }
    } catch (emailError) {
      console.error('Failed to send escalation email:', emailError.message);
      // Don't fail the escalation if email fails
    }

    res.status(200).json({
      success: true,
      message: "Ticket escalated successfully",
      data: {
        ticket,
      },
    });
  } catch (error) {
    if (error.message.includes("not found") || error.message.includes("Can only escalate")) {
      throw error;
    }
    res.status(500);
    throw new Error(`Failed to escalate ticket: ${error.message}`);
  }
});

export {
  createTicket,
  getAllTickets,
  getUserTickets,
  getTicketById,
  updateTicketStatus,
  assignTicket,
  addTicketResponse,
  getTicketStatistics,
  escalateTicket,
};