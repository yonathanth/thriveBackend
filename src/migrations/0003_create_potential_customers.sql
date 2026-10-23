-- Create potential_customer table
CREATE TABLE IF NOT EXISTS potential_customer (
    id SERIAL PRIMARY KEY,
    "fullName" VARCHAR(255) NOT NULL,
    "phoneNumber" VARCHAR(50) NOT NULL,
    email VARCHAR(255),
    "registeredAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status VARCHAR(20) DEFAULT 'pending' NOT NULL,
    "convertedAt" TIMESTAMP,
    "convertedToMemberId" INTEGER,
    "serviceId" INTEGER,
    notes TEXT,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT fk_converted_member FOREIGN KEY ("convertedToMemberId") REFERENCES member(id) ON DELETE SET NULL,
    CONSTRAINT fk_potential_customer_service FOREIGN KEY ("serviceId") REFERENCES service(id) ON DELETE SET NULL
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_potential_customer_phone ON potential_customer("phoneNumber");
CREATE INDEX IF NOT EXISTS idx_potential_customer_email ON potential_customer(email);
CREATE INDEX IF NOT EXISTS idx_potential_customer_status ON potential_customer(status);
CREATE INDEX IF NOT EXISTS idx_potential_customer_registered_at ON potential_customer("registeredAt");
CREATE INDEX IF NOT EXISTS idx_potential_customer_service_id ON potential_customer("serviceId");

