import mongoose from "mongoose";

const ticketResponseSchema = new mongoose.Schema(
  {
    ticket: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SupportTicket",
      required: [true, "Ticket reference is required"],
    },
    respondent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Respondent is required"],
    },
    message: {
      type: String,
      required: [true, "Message is required"],
      trim: true,
      maxlength: [2000, "Message cannot exceed 2000 characters"],
    },
    responseType: {
      type: String,
      enum: ["customer", "agent", "system", "internal"],
      required: true,
    },
    isInternal: {
      type: Boolean,
      default: false,
    },

    isEdited: {
      type: Boolean,
      default: false,
    },
    editedAt: {
      type: Date,
      default: null,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    originalMessage: {
      type: String,
      default: null,
    },
    readBy: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    isAutomated: {
      type: Boolean,
      default: false,
    },
    automationTrigger: {
      type: String,
      enum: ["status_change", "assignment", "escalation", "reminder", "resolution"],
      default: null,
    },
    metadata: {
      ipAddress: {
        type: String,
        default: null,
      },
      userAgent: {
        type: String,
        default: null,
      },
      source: {
        type: String,
        enum: ["web", "mobile", "email", "api", "system"],
        default: "web",
      },
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual for response time from previous message
ticketResponseSchema.virtual("responseTimeFromPrevious").get(function () {
  // This would need to be calculated in the controller
  // by comparing with the previous response timestamp
  return null;
});

// Index for better query performance
ticketResponseSchema.index({ ticket: 1, createdAt: 1 });
ticketResponseSchema.index({ respondent: 1 });
ticketResponseSchema.index({ responseType: 1 });
ticketResponseSchema.index({ isInternal: 1 });
ticketResponseSchema.index({ createdAt: -1 });

// Pre-save middleware to handle message editing
ticketResponseSchema.pre("save", function (next) {
  if (this.isModified("message") && !this.isNew) {
    this.isEdited = true;
    this.editedAt = new Date();
    // Store original message if not already stored
    if (!this.originalMessage) {
      // This would need to be handled in the controller
      // to store the original message before modification
    }
  }
  next();
});

// Static method to get response statistics for a ticket
ticketResponseSchema.statics.getTicketResponseStats = async function (ticketId) {
  const stats = await this.aggregate([
    {
      $match: {
        ticket: new mongoose.Types.ObjectId(ticketId),
      },
    },
    {
      $group: {
        _id: "$responseType",
        count: { $sum: 1 },
        lastResponse: { $max: "$createdAt" },
      },
    },
  ]);
  
  const totalResponses = await this.countDocuments({
    ticket: new mongoose.Types.ObjectId(ticketId),
  });
  
  return {
    totalResponses,
    responseBreakdown: stats,
  };
};

// Static method to get unread responses for a user
ticketResponseSchema.statics.getUnreadResponses = async function (userId, ticketId = null) {
  const matchCondition = {
    "readBy.user": { $ne: new mongoose.Types.ObjectId(userId) },
  };
  
  if (ticketId) {
    matchCondition.ticket = new mongoose.Types.ObjectId(ticketId);
  }
  
  return await this.find(matchCondition)
    .populate("ticket", "ticketId subject status")
    .populate("respondent", "firstName lastName email role")
    .sort({ createdAt: -1 });
};

// Static method to mark responses as read
ticketResponseSchema.statics.markAsRead = async function (responseIds, userId) {
  const responses = await this.find({
    _id: { $in: responseIds },
    "readBy.user": { $ne: new mongoose.Types.ObjectId(userId) },
  });
  
  for (const response of responses) {
    response.readBy.push({
      user: new mongoose.Types.ObjectId(userId),
      readAt: new Date(),
    });
    await response.save();
  }
  
  return responses.length;
};

// Static method to get response timeline for a ticket
ticketResponseSchema.statics.getTicketTimeline = async function (ticketId) {
  return await this.find({ ticket: new mongoose.Types.ObjectId(ticketId) })
    .populate("respondent", "firstName lastName email role")
    .populate("editedBy", "firstName lastName email")
    .sort({ createdAt: 1 })
    .lean();
};

const TicketResponse = mongoose.model("TicketResponse", ticketResponseSchema);

export default TicketResponse;