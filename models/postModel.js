import mongoose from "mongoose";

const postSchema = new mongoose.Schema(
  {
    content: {
      type: String,
      required: [true, "Post content is required"],
      trim: true,
      maxlength: [500, "Post content cannot exceed 500 characters"],
    },
    author: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Author is required"],
    },
    media: [
      {
        type: String, // Path to uploaded images
        trim: true,
      },
    ],
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        default: [],
      },
    ],
    comments: [
      {
        author: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        content: {
          type: String,
          required: [true, "Comment content is required"],
          trim: true,
          maxlength: [200, "Comment cannot exceed 200 characters"],
        },
        createdAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
  },
  { timestamps: true }
);

// Indexes for efficient querying
postSchema.index({ author: 1 });
postSchema.index({ createdAt: -1 });
postSchema.index({ likes: 1 });
postSchema.index({ "comments.author": 1 });
postSchema.index({ "comments.createdAt": -1 });

export default mongoose.model("Post", postSchema);
