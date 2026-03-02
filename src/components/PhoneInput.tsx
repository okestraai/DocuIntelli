import React from 'react';
import PhoneInputWithCountry from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

interface PhoneInputProps {
  value: string;
  onChange: (value: string) => void;
  error?: boolean;
  placeholder?: string;
  className?: string;
}

export function PhoneInput({ value, onChange, error, placeholder = 'Enter phone number', className }: PhoneInputProps) {
  return (
    <div className={`phone-input-wrapper ${error ? 'phone-input-error' : ''} ${className || ''}`}>
      <PhoneInputWithCountry
        international
        defaultCountry="US"
        value={value}
        onChange={(val) => onChange(val || '')}
        placeholder={placeholder}
      />
      <style>{`
        .phone-input-wrapper .PhoneInput {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          border: 2px solid #d1d5db;
          border-radius: 12px;
          transition: all 0.15s;
          background: white;
        }
        .phone-input-wrapper .PhoneInput:focus-within {
          border-color: #10b981;
          box-shadow: 0 0 0 2px rgba(16, 185, 129, 0.2);
        }
        .phone-input-error .PhoneInput {
          border-color: #fca5a5;
          background-color: #fef2f2;
        }
        .phone-input-wrapper .PhoneInputCountry {
          display: flex;
          align-items: center;
          gap: 4px;
        }
        .phone-input-wrapper .PhoneInputCountryIcon {
          width: 24px;
          height: 18px;
          border-radius: 2px;
          overflow: hidden;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
        }
        .phone-input-wrapper .PhoneInputCountryIcon--border {
          background-color: transparent;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
        }
        .phone-input-wrapper .PhoneInputCountryIcon img,
        .phone-input-wrapper .PhoneInputCountryIcon svg {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .phone-input-wrapper .PhoneInputCountrySelect {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
          z-index: 1;
        }
        .phone-input-wrapper .PhoneInputCountrySelectArrow {
          width: 6px;
          height: 6px;
          border-style: solid;
          border-color: #64748b;
          border-width: 0 1px 1px 0;
          transform: rotate(45deg);
          margin-left: 2px;
        }
        .phone-input-wrapper .PhoneInputInput {
          flex: 1;
          border: none;
          outline: none;
          font-size: 16px;
          color: #0f172a;
          background: transparent;
          min-width: 0;
        }
        .phone-input-wrapper .PhoneInputInput::placeholder {
          color: #94a3b8;
        }
      `}</style>
    </div>
  );
}
