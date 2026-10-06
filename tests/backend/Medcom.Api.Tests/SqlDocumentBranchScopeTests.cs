using Medcom.Application;
using Medcom.Contracts;
using Medcom.Infrastructure;
using Xunit;

namespace Medcom.Api.Tests;

// These inspect the same SQL builders used by production. They do not execute SQL Server.
public sealed class SqlDocumentBranchScopeTests
{
    [Theory]
    [InlineData(DocumentKind.PurchaseOrders)] [InlineData(DocumentKind.InboundRequests)]
    public void Both_document_shapes_keep_explicit_exact_branch_scope_and_native_rights(DocumentKind kind)
    {
        foreach (var sql in new[] { SqlDocumentReader.ListSql(kind, 2), SqlDocumentReader.DetailSql(kind, 2) })
        {
            Assert.Contains("DATALENGTH(@branch0)", sql);
            Assert.Contains("DATALENGTH(@branch1)", sql);
            Assert.Contains("CONVERT(varbinary(max),CONVERT(nvarchar(max),D.BranchID))", sql);
            Assert.Contains("U.BranchID IS NULL OR DATALENGTH(U.BranchID)=0", sql);
            Assert.Contains("U.[Disable]=0 AND G.IsDisable=0", sql);
            Assert.Contains("@storedHash", sql);
            Assert.Contains("M.MenuID=@menu AND M.FormName=@form", sql);
            Assert.Contains("M.isDisable=0", sql);
            Assert.Contains("@skip", sql); Assert.Contains("@take", sql);
            Assert.DoesNotContain("BranchID IN", sql);
            Assert.DoesNotContain("LTRIM", sql);
            Assert.DoesNotContain("RTRIM", sql);
        }
        Assert.Contains("D.DocumentID=@document", SqlDocumentReader.DetailSql(kind, 2));
        Assert.Contains("C.DocumentID=D.DocumentID", SqlDocumentReader.DetailSql(kind, 2));
    }

    [Theory]
    [InlineData(0)] [InlineData(201)]
    public void Empty_or_overflow_derived_scope_cannot_build_document_sql(int count)
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => SqlDocumentReader.ListSql(DocumentKind.PurchaseOrders, count));
        Assert.Throws<ArgumentOutOfRangeException>(() => SqlDocumentReader.DetailSql(DocumentKind.InboundRequests, count));
    }
}
