import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false,
  auth: {
    user: "codesvistaaitzaz@gmail.com",
    pass: "bbmnmmjkdmsiwdaw",
  },
  pool: true,
  maxConnections: 5,
});
