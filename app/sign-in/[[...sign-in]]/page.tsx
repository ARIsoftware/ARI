"use client"

import { SignIn } from "@clerk/nextjs"
import { DM_Sans } from "next/font/google"

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Top Bar */}
      <div className="h-[35px] bg-black w-full relative z-50 flex items-center justify-center">
        <span className={`text-white font-medium ${dmSans.className}`}>ARI-2</span>
      </div>

      {/* Login Form */}
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <SignIn
            appearance={{
              elements: {
                rootBox: "mx-auto",
                card: "bg-white shadow-lg border border-gray-200 rounded-lg p-8",
                headerTitle: "text-2xl font-semibold text-gray-900 text-center mb-2",
                headerSubtitle: "text-sm text-gray-600 text-center mb-6",
                socialButtonsBlockButton:
                  "w-full border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-md transition-colors",
                socialButtonsBlockButtonText: "font-medium",
                dividerLine: "bg-gray-200",
                dividerText: "text-gray-500 text-sm",
                formFieldInput:
                  "w-full px-3 py-2.5 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                formFieldLabel: "block text-sm font-medium text-gray-700 mb-1",
                formButtonPrimary:
                  "w-full bg-black hover:bg-gray-800 text-white font-medium py-2.5 px-4 rounded-md transition-colors",
                footerActionLink: "text-blue-600 hover:text-blue-500 font-medium",
                identityPreviewText: "text-gray-600",
                identityPreviewEditButton: "text-blue-600 hover:text-blue-500",
                formResendCodeLink: "text-blue-600 hover:text-blue-500 text-sm",
                otpCodeFieldInput:
                  "w-12 h-12 text-center border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                alertClerkError: "text-red-600 text-sm mt-2",
                formFieldSuccessText: "text-green-600 text-sm mt-1",
                formFieldErrorText: "text-red-600 text-sm mt-1",
                formFieldWarningText: "text-yellow-600 text-sm mt-1",
              },
              layout: {
                socialButtonsPlacement: "bottom",
                showOptionalFields: false,
              },
              variables: {
                colorPrimary: "#000000",
                colorText: "#374151",
                colorTextSecondary: "#6B7280",
                colorBackground: "#FFFFFF",
                colorInputBackground: "#FFFFFF",
                colorInputText: "#374151",
                borderRadius: "0.375rem",
              },
            }}
            redirectUrl="/"
            signUpUrl="/sign-up"
          />
        </div>
      </div>
    </div>
  )
}
