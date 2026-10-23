-- Create sms_message table
CREATE TABLE IF NOT EXISTS sms_message (
  id SERIAL PRIMARY KEY,
  message_id VARCHAR(255) UNIQUE,
  member_id INTEGER,
  phone_number VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'queued',
  campaign_id VARCHAR(255),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT fk_sms_member FOREIGN KEY (member_id) REFERENCES member(id) ON DELETE SET NULL
);

-- Create indexes for sms_message
CREATE INDEX IF NOT EXISTS idx_sms_message_id ON sms_message(message_id);
CREATE INDEX IF NOT EXISTS idx_sms_member_id ON sms_message(member_id);
CREATE INDEX IF NOT EXISTS idx_sms_status ON sms_message(status);
CREATE INDEX IF NOT EXISTS idx_sms_created_at ON sms_message(created_at);

-- Create sms_template table
CREATE TABLE IF NOT EXISTS sms_template (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL,
  content TEXT NOT NULL,
  variables JSONB,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for sms_template
CREATE INDEX IF NOT EXISTS idx_template_type ON sms_template(type);

-- Insert default renewal reminder template
INSERT INTO sms_template (name, type, content, variables, is_active)
VALUES (
  'Subscription Renewal Reminder',
  'renewal',
  'Hi {memberName}, your subscription expires on {expiryDate}. Please renew to continue enjoying our services!',
  '{"memberName": "Member full name", "expiryDate": "Subscription expiry date", "daysLeft": "Days until expiry"}',
  true
) ON CONFLICT DO NOTHING;

-- Insert default general notification template
INSERT INTO sms_template (name, type, content, variables, is_active)
VALUES (
  'General Notification',
  'general',
  'Hello {memberName}, {message}',
  '{"memberName": "Member full name", "message": "Custom message content"}',
  true
) ON CONFLICT DO NOTHING;

-- Insert default payment confirmation template
INSERT INTO sms_template (name, type, content, variables, is_active)
VALUES (
  'Payment Confirmation',
  'payment',
  'Hi {memberName}, thank you for your payment of {amount}. Your subscription is now active until {expiryDate}.',
  '{"memberName": "Member full name", "amount": "Payment amount", "expiryDate": "New subscription expiry date"}',
  true
) ON CONFLICT DO NOTHING;







