const { AdminSettings } = require('../../models/admin/adminSettings');
const SecurityLog = require('../../models/security/securityLog');
const { validationResult } = require('express-validator');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');

/**
 * System Settings Controller
 * Handles platform-wide settings, CSV uploads, and configuration management
 */

/**
 * Get all system settings
 */
exports.getSystemSettings = async (req, res) => {
    try {
        const settings = await AdminSettings.findOne();
        
        if (!settings) {
            // Create default settings if none exist
            const defaultSettings = new AdminSettings({
                canCreateRaffle: 'everyone',
                raffleTokenCountRequired: 2000,
                raffleFeePercentage: 3,
                wageringFeePercentage: 3,
                allowSellersReserveRaffles: true,
                salesRoyalties: true,
                openEntryExchangeRate: 500
            });
            
            await defaultSettings.save();
            return res.json({
                success: true,
                data: defaultSettings
            });
        }

        res.json({
            success: true,
            data: settings
        });

    } catch (error) {
        console.error('Error getting system settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get system settings',
            details: error.message
        });
    }
};