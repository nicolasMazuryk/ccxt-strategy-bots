export function shouldFilterError(errorCodes, error) {
    const filteredErrorCodes = [
        -2022, // 'binanceusdm {"code":-2022,"msg":"ReduceOnly Order is rejected."}'
        -2011  // binanceusdm [{"code":-2011,"msg":"Unknown order sent."}]
    ]
    
    return errorCodes.some(code => error.message.includes(`"code":${code}`))
} 