import { Request, Response } from 'express';
import * as addressService from './addresses.service';

export const getUserAddresses = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req.query.userId || req.body.userId) as string;

    if (!userId) {
      res.status(400).json({ message: "Parameter userId wajib disertakan!" });
      return;
    }
    
    const result = await addressService.getUserAddressesService(userId);
    res.status(200).json({ data: result });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const createAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const { 
      userId, 
      addressName, 
      receiverName, 
      phoneNumber, 
      addressDetails, 
      province, 
      city, 
      district, 
      latitude, 
      longitude, 
      isPrimary 
    } = req.body;

    if (!userId || !addressName || !receiverName || !phoneNumber || !addressDetails || latitude === undefined || longitude === undefined) {
      res.status(400).json({ message: "Semua kolom input termasuk userId dan koordinat GPS wajib diisi!" });
      return;
    }

    const newAddress = await addressService.createAddressService(userId, {
      addressName,
      receiverName,
      phoneNumber,
      addressDetails,
      province: province || "DKI Jakarta",
      city: city || "Jakarta Pusat",
      district: district || "Gambir",
      latitude: Number(latitude),
      longitude: Number(longitude),
      isPrimary
    });

    res.status(201).json({
      message: "Alamat baru dinamis berhasil ditambahkan!",
      data: newAddress
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};

export const updateAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const addressId = req.params.id as string;
    const { userId, addressName, receiverName, phoneNumber, addressDetails, isPrimary } = req.body;

    if (!userId) {
      res.status(400).json({ message: "userId wajib disertakan untuk melakukan update!" });
      return;
    }

    const updatedAddress = await addressService.updateAddressService(addressId, userId, {
      label: addressName,
      receiver: receiverName,
      phone: phoneNumber,
      address: addressDetails,
      isPrimary: isPrimary
    });

    res.status(200).json({
      message: "Alamat berhasil diperbarui!",
      data: updatedAddress
    });
  } catch (error: any) {
    console.error("Eror detail di backend:", error);
    res.status(500).json({ message: error.message });
  }
};

export const deleteAddress = async (req: Request, res: Response): Promise<void> => {
  try {
    const addressId = req.params.id as string;
    const userId = (req.query.userId || req.body.userId) as string;

    if (!userId) {
      res.status(400).json({ message: "userId wajib disertakan untuk menghapus alamat!" });
      return;
    }

    await addressService.deleteAddressService(addressId, userId);

    res.status(200).json({
      message: "Alamat berhasil dihapus!"
    });
  } catch (error: any) {
    res.status(500).json({ message: error.message });
  }
};