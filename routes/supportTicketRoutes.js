import express from "express";
import {
  createTicket,
  getAllTickets,
  getUserTickets,
  getTicketById,
  updateTicketStatus,
  assignTicket,
  addTicketResponse,
  getTicketStatistics,
  escalateTicket,
} from "../controllers/supportTicketController.js";
import authHandler from "../middlewares/authMIddleware.js";
import adminHandler from "../middlewares/adminMiddleware.js";
import { validateUserId } from "../middlewares/userIdValidation.js";

const router = express.Router();

// Public routes (none for support tickets - all require authentication)

// User routes - authenticated users can create and view their own tickets
router.post("/tickets", authHandler, createTicket);
router.get("/my-tickets", authHandler, getUserTickets);

// Ticket detail routes - accessible by owner, assigned agent, or admin
router.get("/tickets/:ticketId", authHandler, getTicketById);
router.post("/tickets/:ticketId/responses", authHandler, addTicketResponse);

// Admin/Agent only routes - require admin privileges
router.get("/tickets", authHandler, adminHandler, getAllTickets);
router.patch("/tickets/:ticketId/status", authHandler, adminHandler, updateTicketStatus);
router.patch("/tickets/:ticketId/assign", authHandler, adminHandler, assignTicket);
router.patch("/tickets/:ticketId/escalate", authHandler, adminHandler, escalateTicket);
router.get("/statistics", authHandler, adminHandler, getTicketStatistics);

// Additional utility routes for agents

// @desc    Get tickets assigned to current agent
// @route   GET /api/support/my-assigned-tickets
// @access  Private (Agent/Admin only)
router.get("/my-assigned-tickets", authHandler, adminHandler, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      status,
      priority,
      category,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;
    
    const agentId = req.user._id;

    // Build filter object
    const filter = { assignedAgent: agentId };
    
    if (status) filter.status = status;
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const SupportTicket = (await import("../models/supportTicketModel.js")).default;
    
    const tickets = await SupportTicket.find(filter)
      .populate("user", "firstName lastName email phoneNumber")
      .populate("lastUpdatedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTickets = await SupportTicket.countDocuments(filter);
    const totalPages = Math.ceil(totalTickets / parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Your assigned tickets retrieved successfully",
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
    res.status(500).json({
      success: false,
      message: `Failed to retrieve assigned tickets: ${error.message}`,
    });
  }
});

// @desc    Get unassigned tickets
// @route   GET /api/support/unassigned-tickets
// @access  Private (Admin only)
router.get("/unassigned-tickets", authHandler, adminHandler, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      priority,
      category,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = { 
      assignedAgent: null,
      status: { $in: ["open", "in-progress"] }
    };
    
    if (priority) filter.priority = priority;
    if (category) filter.category = category;

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const SupportTicket = (await import("../models/supportTicketModel.js")).default;
    
    const tickets = await SupportTicket.find(filter)
      .populate("user", "firstName lastName email phoneNumber")
      .populate("lastUpdatedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTickets = await SupportTicket.countDocuments(filter);
    const totalPages = Math.ceil(totalTickets / parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Unassigned tickets retrieved successfully",
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
    res.status(500).json({
      success: false,
      message: `Failed to retrieve unassigned tickets: ${error.message}`,
    });
  }
});

// @desc    Get escalated tickets
// @route   GET /api/support/escalated-tickets
// @access  Private (Admin only)
router.get("/escalated-tickets", authHandler, adminHandler, async (req, res) => {
  try {
    const {
      page = 1,
      limit = 10,
      sortBy = "escalatedAt",
      sortOrder = "desc",
    } = req.query;

    // Build filter object
    const filter = { isEscalated: true };

    // Build sort object
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const SupportTicket = (await import("../models/supportTicketModel.js")).default;
    
    const tickets = await SupportTicket.find(filter)
      .populate("user", "firstName lastName email phoneNumber")
      .populate("assignedAgent", "firstName lastName email")
      .populate("escalatedTo", "firstName lastName email")
      .populate("lastUpdatedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalTickets = await SupportTicket.countDocuments(filter);
    const totalPages = Math.ceil(totalTickets / parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Escalated tickets retrieved successfully",
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
    res.status(500).json({
      success: false,
      message: `Failed to retrieve escalated tickets: ${error.message}`,
    });
  }
});

// @desc    Get ticket responses
// @route   GET /api/support/tickets/:ticketId/responses
// @access  Private (Owner, Admin, or Assigned Agent)
router.get("/tickets/:ticketId/responses", authHandler, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const {
      page = 1,
      limit = 20,
      includeInternal = false,
      sortOrder = "asc",
    } = req.query;
    
    const userId = req.user._id;
    const userRole = req.user.role;

    const SupportTicket = (await import("../models/supportTicketModel.js")).default;
    const TicketResponse = (await import("../models/ticketResponseModel.js")).default;
    
    // First, verify user has access to this ticket
    const ticket = await SupportTicket.findOne({
      $or: [
        { _id: ticketId },
        { ticketId: ticketId }
      ]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    // Check permissions
    const isOwner = ticket.user.toString() === userId.toString();
    const isAdminOrAgent = ["admin", "superadmin", "agent"].includes(userRole);
    const isAssignedAgent = ticket.assignedAgent && ticket.assignedAgent.toString() === userId.toString();

    if (!isOwner && !isAdminOrAgent && !isAssignedAgent) {
      return res.status(403).json({
        success: false,
        message: "Access denied: You don't have permission to view responses for this ticket",
      });
    }

    // Build filter for responses
    const filter = { ticket: ticket._id };
    
    // Only admins/agents can see internal responses
    if (!isAdminOrAgent && !isAssignedAgent) {
      filter.isInternal = false;
    } else if (includeInternal === "false") {
      filter.isInternal = false;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { createdAt: sortOrder === "desc" ? -1 : 1 };
    
    const responses = await TicketResponse.find(filter)
      .populate("respondent", "firstName lastName email role")
      .populate("editedBy", "firstName lastName")
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    const totalResponses = await TicketResponse.countDocuments(filter);
    const totalPages = Math.ceil(totalResponses / parseInt(limit));

    res.status(200).json({
      success: true,
      message: "Ticket responses retrieved successfully",
      data: {
        responses,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalResponses,
          hasNextPage: parseInt(page) < totalPages,
          hasPrevPage: parseInt(page) > 1,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to retrieve ticket responses: ${error.message}`,
    });
  }
});

// @desc    Update ticket priority
// @route   PATCH /api/support/tickets/:ticketId/priority
// @access  Private (Admin/Agent only)
router.patch("/tickets/:ticketId/priority", authHandler, adminHandler, async (req, res) => {
  try {
    const { ticketId } = req.params;
    const { priority, reason } = req.body;
    const userId = req.user._id;

    const validPriorities = ["low", "medium", "high", "urgent"];
    
    if (!priority || !validPriorities.includes(priority)) {
      return res.status(400).json({
        success: false,
        message: "Valid priority is required (low, medium, high, urgent)",
      });
    }

    const SupportTicket = (await import("../models/supportTicketModel.js")).default;
    const TicketResponse = (await import("../models/ticketResponseModel.js")).default;
    
    const ticket = await SupportTicket.findOne({
      $or: [
        { _id: ticketId },
        { ticketId: ticketId }
      ]
    });

    if (!ticket) {
      return res.status(404).json({
        success: false,
        message: "Ticket not found",
      });
    }

    const oldPriority = ticket.priority;
    ticket.priority = priority;
    ticket.lastUpdatedBy = userId;

    // Add internal note if reason provided
    if (reason) {
      ticket.internalNotes.push({
        note: `Priority changed from "${oldPriority}" to "${priority}". Reason: ${reason}`,
        addedBy: userId,
      });
    }

    await ticket.save();

    // Create system response for priority change
    await TicketResponse.create({
      ticket: ticket._id,
      respondent: userId,
      message: `Ticket priority changed from "${oldPriority}" to "${priority}"`,
      responseType: "system",
      isAutomated: true,
      automationTrigger: "status_change",
    });

    await ticket.populate("user", "firstName lastName email");
    await ticket.populate("assignedAgent", "firstName lastName email");
    await ticket.populate("lastUpdatedBy", "firstName lastName");

    res.status(200).json({
      success: true,
      message: "Ticket priority updated successfully",
      data: {
        ticket,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: `Failed to update ticket priority: ${error.message}`,
    });
  }
});

export default router;