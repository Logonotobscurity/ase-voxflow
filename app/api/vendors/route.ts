import { NextResponse } from 'next/server';
import { z } from 'zod';

const VendorSchema = z.object({
  name: z.string().min(2),
  category: z.enum(['RAW_MATERIALS', 'LOGISTICS', 'TECHNOLOGY', 'PROFESSIONAL_SERVICES', 'FACILITIES', 'UTILITIES']),
  status: z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED', 'BLACKLISTED']).default('ACTIVE'),
  tier: z.enum(['PREFERRED', 'APPROVED', 'TRIAL']).default('TRIAL'),
  currency: z.string().length(3).default('NGN'),
  creditLimit: z.number().nonnegative().default(0),
  paymentTerms: z.string().max(100).default('Net 30'),
}).strict();

const sampleVendors = [{
  id: 'ven_001',
  name: 'Kora Packaging Ltd.',
  category: 'RAW_MATERIALS',
  status: 'ACTIVE',
  tier: 'PREFERRED',
  currency: 'NGN',
  creditLimit: 15_000_000,
  paymentTerms: 'Net 30',
}];

export async function GET() {
  return NextResponse.json({
    data: sampleVendors,
    total: sampleVendors.length,
    demo: true,
    persistence: 'none',
    warning: 'Illustrative records only; no vendor system is connected.',
  });
}

export async function POST(request: Request) {
  const parsed = VendorSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Vendor input did not match the legacy demo contract.',
        retryable: false,
        details: parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
      },
    }, { status: 422 });
  }

  return NextResponse.json({
    error: {
      code: 'NOT_IMPLEMENTED',
      message: 'Vendor writes are not connected to canonical persistence. No record was created.',
      retryable: false,
    },
  }, { status: 501 });
}
