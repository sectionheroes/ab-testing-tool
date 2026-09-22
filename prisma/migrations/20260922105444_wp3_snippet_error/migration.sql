-- CreateTable
CREATE TABLE "SnippetError" (
    "id" TEXT NOT NULL,
    "shopId" TEXT NOT NULL,
    "experimentKey" TEXT NOT NULL,
    "variantKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SnippetError_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SnippetError_shopId_createdAt_idx" ON "SnippetError"("shopId", "createdAt");

-- AddForeignKey
ALTER TABLE "SnippetError" ADD CONSTRAINT "SnippetError_shopId_fkey" FOREIGN KEY ("shopId") REFERENCES "Shop"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
