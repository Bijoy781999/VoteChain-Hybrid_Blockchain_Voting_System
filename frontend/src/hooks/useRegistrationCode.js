import { useState } from "react";
import { authAPI } from "../services/api";
import { parseErrorMessage } from "../utils/format";

/**
 * Shared 2-step email verification state/handlers for Voter, Candidate, and Admin registrations.
 */
export function useRegistrationCode(role) {
  const [step, setStep] = useState(1); // 1: Request Code, 2: Enter Code & Register
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [devCode, setDevCode] = useState(null);
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [isRequestingCode, setIsRequestingCode] = useState(false);

  const requestCode = async (overrideEmail = email) => {
    setErrorMsg("");
    setStatusMsg("");
    if (!overrideEmail || !overrideEmail.trim()) {
      setErrorMsg("Please enter your email address to receive a verification code.");
      return false;
    }

    setIsRequestingCode(true);
    try {
      const res = await authAPI.requestRegistrationCode({
        email: overrideEmail.trim(),
        role,
      });
      if (res.data.success) {
        setStatusMsg(res.data.message);
        if (res.data.verificationCode) {
          setDevCode(res.data.verificationCode);
        }
        setStep(2);
        return true;
      }
      return false;
    } catch (err) {
      setErrorMsg(parseErrorMessage(err));
      return false;
    } finally {
      setIsRequestingCode(false);
    }
  };

  const resetToEmailStep = () => {
    setStep(1);
    setCode("");
    setStatusMsg("");
    setErrorMsg("");
  };

  return {
    step,
    setStep,
    email,
    setEmail,
    code,
    setCode,
    devCode,
    statusMsg,
    setStatusMsg,
    errorMsg,
    setErrorMsg,
    isRequestingCode,
    requestCode,
    resetToEmailStep,
  };
}
