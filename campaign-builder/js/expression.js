// Phân tách biểu thức điều kiện Camunda thành các tham số cấu hình trực quan
window.parseExpression = function(nodeType, expression) {
    if (!expression) return {};
    
    if (nodeType === 'Condition_MemberRank') {
        const match = expression.match(/\$\{memberRank\s*==\s*'([^']+)'\}/) || expression.match(/\$\{memberRank\s*==\s*"([^"]+)"\}/);
        return { rank: match ? match[1] : 'GOLD' };
    }
    
    if (nodeType === 'Condition_TotalSpending') {
        const match = expression.match(/\$\{totalSpending\s*(>=|<=|>|<|==)\s*(\d+)\}/);
        return { operator: match ? match[1] : '>=', amount: match ? Number(match[2]) : 5000000 };
    }
    
    if (nodeType === 'Condition_AntiFraudScore') {
        const match = expression.match(/\$\{antiFraudScore\s*(>=|<=|>|<|==)\s*(\d+)\}/);
        return { operator: match ? match[1] : '<=', score: match ? Number(match[2]) : 50 };
    }
    
    if (nodeType === 'Condition_Location') {
        const match = expression.match(/\$\{targetProvince\s*==\s*'([^']+)'\}/) || expression.match(/\$\{targetProvince\s*==\s*"([^"]+)"\}/);
        return { value: match ? match[1] : 'Hanoi' };
    }
    
    if (nodeType === 'Condition_ContainsCategory') {
        const match = expression.match(/\$\{containsCategory\s*==\s*'([^']+)'\}/) || expression.match(/\$\{containsCategory\s*==\s*"([^"]+)"\}/);
        return { value: match ? match[1] : '101' };
    }
    
    if (nodeType === 'Condition_ContainsProduct') {
        const match = expression.match(/\$\{containsProduct\s*==\s*'([^']+)'\}/) || expression.match(/\$\{containsProduct\s*==\s*"([^"]+)"\}/);
        return { value: match ? match[1] : 'prod-001' };
    }
    
    return { raw: expression };
};
