function updateProgressBar(counter, total, options = {}) {
    const totalItems = total - 1
    const percentage = Math.floor((counter / totalItems) * 100)
    const lastPercentage = Math.floor(((counter - 1) / totalItems) * 100)
    
    if (percentage > lastPercentage) {
        const progressBarWidth = options.width || 50
        const filledWidth = Math.floor((percentage / 100) * progressBarWidth)
        const emptyWidth = progressBarWidth - filledWidth
        const progressBar = '█'.repeat(filledWidth) + '░'.repeat(emptyWidth)
        return {
            progressBar,
            percentage,
            counter,
            total: totalItems,
            shouldUpdate: true
        }
    }
    
    return { shouldUpdate: false }
}

export { updateProgressBar }