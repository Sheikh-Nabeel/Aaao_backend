import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const supportTicketSchema = new mongoose.Schema(
  {
    ticketId: {
      type: String,
      unique: true,
      default: () => `TICKET-${uuidv4().substring(0, 8).toUpperCase()}`,
      required: true,
    },
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "User is required"],
    },
    subject: {
      type: String,
      required: [true, "Subject is required"],
      trim: true,
      maxlength: [200, "Subject cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Description is required"],
      trim: true,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    status: {
      type: String,
      enum: ["open", "in-progress", "resolved", "closed"],
      default: "open",
      required: true,
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
      required: true,
    },
    category: {
      type: String,
      enum: [
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
      ],
      default: "general",
      required: true,
    },
    assignedAgent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    tags: [
      {
        type: String,
        trim: true,
        maxlength: [50, "Tag cannot exceed 50 characters"],
      },
    ],
    lastUpdatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    closedAt: {
      type: Date,
      default: null,
    },
    estimatedResolutionTime: {
      type: Date,
      default: null,
    },
    actualResolutionTime: {
      type: Number, // in minutes
      default: null,
    },
    customerSatisfactionRating: {
      type: Number,
      min: 1,
      max: 5,
      default: null,
    },
    customerFeedback: {
      type: String,
      trim: true,
      maxlength: [1000, "Feedback cannot exceed 1000 characters"],
      default: null,
    },
    isEscalated: {
      type: Boolean,
      default: false,
    },
    escalatedAt: {
      type: Date,
      default: null,
    },
    escalatedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    internalNotes: [
      {
        note: {
          type: String,
          required: true,
          trim: true,
        },
        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        addedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for ticket age in hours
supportTicketSchema.virtual("ageInHours").get(function () {
  return Math.floor((Date.now() - this.createdAt) / (1000 * 60 * 60));
});

// Virtual for response time calculation
supportTicketSchema.virtual("responseTime").get(function () {
  if (this.status === "open") {
    return null;
  }
  // This would be calculated based on first response from agent
  return this.updatedAt - this.createdAt;
});

// Index for better query performance
supportTicketSchema.index({ user: 1, status: 1 });
supportTicketSchema.index({ assignedAgent: 1, status: 1 });
supportTicketSchema.index({ ticketId: 1 });
supportTicketSchema.index({ createdAt: -1 });
supportTicketSchema.index({ priority: 1, status: 1 });
supportTicketSchema.index({ category: 1 });

// Pre-save middleware to update resolution times
supportTicketSchema.pre("save", function (next) {
  if (this.isModified("status")) {
    if (this.status === "resolved" && !this.resolvedAt) {
      this.resolvedAt = new Date();
      if (this.createdAt) {
        this.actualResolutionTime = Math.floor(
          (this.resolvedAt - this.createdAt) / (1000 * 60)
        ); // in minutes
      }
    }
    if (this.status === "closed" && !this.closedAt) {
      this.closedAt = new Date();
    }
  }
  next();
});

// Static method to get ticket statistics
supportTicketSchema.statics.getTicketStats = async function () {
  const stats = await this.aggregate([
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);
  
  const priorityStats = await this.aggregate([
    {
      $group: {
        _id: "$priority",
        count: { $sum: 1 },
      },
    },
  ]);
  
  const categoryStats = await this.aggregate([
    {
      $group: {
        _id: "$category",
        count: { $sum: 1 },
      },
    },
  ]);
  
  return {
    statusStats: stats,
    priorityStats: priorityStats,
    categoryStats: categoryStats,
  };
};

// Static method to get agent workload
supportTicketSchema.statics.getAgentWorkload = async function () {
  return await this.aggregate([
    {
      $match: {
        assignedAgent: { $ne: null },
        status: { $in: ["open", "in-progress"] },
      },
    },
    {
      $group: {
        _id: "$assignedAgent",
        ticketCount: { $sum: 1 },
        highPriorityCount: {
          $sum: {
            $cond: [{ $in: ["$priority", ["high", "urgent"]] }, 1, 0],
          },
        },
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "_id",
        foreignField: "_id",
        as: "agent",
      },
    },
    {
      $unwind: "$agent",
    },
    {
      $project: {
        agentName: { $concat: ["$agent.firstName", " ", "$agent.lastName"] },
        agentEmail: "$agent.email",
        ticketCount: 1,
        highPriorityCount: 1,
      },
    },
  ]);
};

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

export default SupportTicket;