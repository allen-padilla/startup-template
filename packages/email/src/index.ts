export {
  EmailConfigurationError,
  EmailDeliveryError,
  EmailError,
  EmailValidationError,
  type EmailDeliveryFailure,
  type EmailMessageField,
  type EmailVariable,
} from "./errors";
export {
  createEmailSender,
  isEmailConfigured,
  sendEmail,
  type EmailMessage,
  type EmailSender,
  type EmailSenderOptions,
  type EmailTransport,
} from "./send";
export {
  escapeHtml,
  html,
  SafeHtml,
  type EmailTemplate,
  type RenderedEmail,
} from "./template";
export {
  emailVerificationEmail,
  type EmailVerificationEmailInput,
} from "./templates/email-verification";
export {
  passwordResetEmail,
  type PasswordResetEmailInput,
} from "./templates/password-reset";
