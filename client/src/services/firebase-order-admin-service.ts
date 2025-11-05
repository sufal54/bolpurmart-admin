// services/firebase-order-admin-service.ts
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
  writeBatch,
  addDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase"; // Your admin panel firebase config
import type { Order } from "@/types"; // Your admin panel types

export class AdminFirebaseOrderService {
  private static ordersCollection = "orders";
  private static notificationsCollection = "notifications";

  // Subscribe to all orders for admin dashboard
  static subscribeToOrders(callback: (orders: Order[]) => void): () => void {
    const ordersRef = collection(db, this.ordersCollection);
    const q = query(ordersRef, orderBy("createdAt", "desc"));

    return onSnapshot(q, (snapshot) => {
      const orders: Order[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        orders.push({
          id: doc.id,
          ...data,
          createdAt: data.createdAt
            ? typeof data.createdAt === "string"
              ? new Date(data.createdAt)
              : data.createdAt.toDate()
            : new Date(),
          updatedAt: data.updatedAt
            ? typeof data.updatedAt === "string"
              ? new Date(data.updatedAt)
              : data.updatedAt.toDate()
            : new Date(),
          estimatedDeliveryTime: data.estimatedDeliveryTime
            ? typeof data.estimatedDeliveryTime === "string"
              ? new Date(data.estimatedDeliveryTime)
              : data.estimatedDeliveryTime.toDate()
            : new Date(),
          deliverySlot: {
            ...data.deliverySlot,
            estimatedTime: data.deliverySlot.estimatedTime
              ? typeof data.deliverySlot.estimatedTime === "string"
                ? new Date(data.deliverySlot.estimatedTime)
                : data.deliverySlot.estimatedTime.toDate()
              : new Date(),
            actualDeliveryTime: data.deliverySlot.actualDeliveryTime
              ? typeof data.deliverySlot.actualDeliveryTime === "string"
                ? new Date(data.deliverySlot.actualDeliveryTime)
                : data.deliverySlot.actualDeliveryTime.toDate()
              : undefined,
          },
          orderTracking: {
            placedAt: data.orderTracking?.placedAt
              ? typeof data.orderTracking.placedAt === "string"
                ? new Date(data.orderTracking.placedAt)
                : data.orderTracking.placedAt.toDate()
              : new Date(),
            confirmedAt: data.orderTracking?.confirmedAt
              ? typeof data.orderTracking.confirmedAt === "string"
                ? new Date(data.orderTracking.confirmedAt)
                : data.orderTracking.confirmedAt.toDate()
              : undefined,
            preparingAt: data.orderTracking?.preparingAt
              ? typeof data.orderTracking.preparingAt === "string"
                ? new Date(data.orderTracking.preparingAt)
                : data.orderTracking.preparingAt.toDate()
              : undefined,
            outForDeliveryAt: data.orderTracking?.outForDeliveryAt
              ? typeof data.orderTracking.outForDeliveryAt === "string"
                ? new Date(data.orderTracking.outForDeliveryAt)
                : data.orderTracking.outForDeliveryAt.toDate()
              : undefined,
            deliveredAt: data.orderTracking?.deliveredAt
              ? typeof data.orderTracking.deliveredAt === "string"
                ? new Date(data.orderTracking.deliveredAt)
                : data.orderTracking.deliveredAt.toDate()
              : undefined,
          },
          reviewedAt: data.reviewedAt
            ? typeof data.reviewedAt === "string"
              ? new Date(data.reviewedAt)
              : data.reviewedAt.toDate()
            : undefined,
        } as Order);
      });

      callback(orders);
    });
  }

  // Update order status
  static async updateOrderStatus(
    orderId: string,
    newStatus: Order["status"]
  ): Promise<void> {
    try {
      const orderRef = doc(db, this.ordersCollection, orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        throw new Error("Order not found");
      }

      const orderData = orderDoc.data();
      const now = new Date();
      const nowISO = now.toISOString();

      // Build update object
      const updateData: any = {
        status: newStatus,
        updatedAt: nowISO,
      };

      // Update tracking based on status
      const trackingField = this.getTrackingFieldForStatus(newStatus);
      if (trackingField) {
        updateData[`orderTracking.${trackingField}`] = nowISO;
      }

      // Special handling for delivered status
      if (newStatus === "delivered") {
        updateData["deliverySlot.actualDeliveryTime"] = nowISO;
        updateData["paymentStatus"] = "completed";
      }

      // Special handling for cancelled status
      if (newStatus === "cancelled") {
        updateData["isCancellable"] = false;
        updateData["isRefundable"] = true;
      }

      // Update the order
      await updateDoc(orderRef, updateData);

      // Create notification for customer
      await this.createStatusUpdateNotification(orderData, newStatus);

      console.log(`Order ${orderId} status updated to ${newStatus}`);
    } catch (error) {
      console.error("Error updating order status:", error);
      throw new Error(`Failed to update order status: ${error}`);
    }
  }

  // Get tracking field name for status
  private static getTrackingFieldForStatus(
    status: Order["status"]
  ): string | null {
    const statusTrackingMap: Record<string, string> = {
      confirmed: "confirmedAt",
      preparing: "preparingAt",
      out_for_delivery: "outForDeliveryAt",
      delivered: "deliveredAt",
    };

    return statusTrackingMap[status] || null;
  }

  // Update payment verification status
  static async updatePaymentVerification(
    orderId: string,
    verificationStatus: "verified" | "rejected",
    rejectionReason?: string
  ): Promise<void> {
    try {
      const orderRef = doc(db, this.ordersCollection, orderId);
      const orderDoc = await getDoc(orderRef);
      
      if (!orderDoc.exists()) {
        throw new Error("Order not found");
      }

      const orderData = orderDoc.data();
      const now = new Date();
      const nowISO = now.toISOString();

      const updateData: any = {
        "paymentDetails.verificationStatus": verificationStatus,
        "paymentDetails.verificationDate": nowISO,
        updatedAt: nowISO,
      };

      // Add rejection reason only for rejected payments
      if (verificationStatus === "rejected" && rejectionReason) {
        updateData["paymentDetails.rejectionReason"] = rejectionReason;
      }

      // If verified, update payment status
      if (verificationStatus === "verified") {
        updateData["paymentStatus"] = "completed";
      } else if (verificationStatus === "rejected") {
        updateData["paymentStatus"] = "failed";
      }

      await updateDoc(orderRef, updateData);

      // Create payment verification notification
      await this.createPaymentVerificationNotification(
        orderData,
        verificationStatus,
        rejectionReason
      );

      console.log(
        `Payment verification updated for order ${orderId}: ${verificationStatus}`
      );
    } catch (error) {
      console.error("Error updating payment verification:", error);
      throw new Error(`Failed to update payment verification: ${error}`);
    }
  }

  // Create status update notification for customer
  private static async createStatusUpdateNotification(
    orderData: any,
    newStatus: Order["status"]
  ): Promise<void> {
    try {
      // Create status-specific messages
      const statusMessages: Record<string, { 
        title: string; 
        message: string; 
        type: "order_update" | "delivery_update"; 
        priority: "low" | "normal" | "high";
      }> = {
        confirmed: {
          title: "Order Confirmed! ✅",
          message: `Your order #${orderData.orderNumber} has been confirmed and is being prepared.`,
          type: "order_update",
          priority: "normal"
        },
        preparing: {
          title: "Order Being Prepared 👨‍🍳",
          message: `Your order #${orderData.orderNumber} is now being prepared in the kitchen.`,
          type: "order_update",
          priority: "normal"
        },
        out_for_delivery: {
          title: "Out for Delivery 🚚",
          message: `Your order #${orderData.orderNumber} is now out for delivery and will reach you soon.`,
          type: "delivery_update",
          priority: "normal"
        },
        delivered: {
          title: "Order Delivered! 🎉",
          message: `Your order #${orderData.orderNumber} has been delivered successfully. Thank you for your order!`,
          type: "delivery_update",
          priority: "high"
        },
        cancelled: {
          title: "Order Cancelled ❌",
          message: `Your order #${orderData.orderNumber} has been cancelled. If you have any questions, please contact support.`,
          type: "order_update",
          priority: "high"
        },
        refunded: {
          title: "Order Refunded 💰",
          message: `Your order #${orderData.orderNumber} has been refunded. The amount will be credited back to your payment method.`,
          type: "order_update",
          priority: "high"
        },
      };

      const statusInfo = statusMessages[newStatus];
      if (!statusInfo) return;

      // Create notification for customer
      const notificationData = {
        type: statusInfo.type,
        title: statusInfo.title,
        message: statusInfo.message,
        orderId: orderData.id || "",
        orderNumber: orderData.orderNumber,
        customerId: orderData.customerId,
        customerName: orderData.customerName,
        customerEmail: orderData.customerEmail,
        total: orderData.total,
        targetAudience: "customer",
        isRead: false,
        priority: statusInfo.priority,
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, this.notificationsCollection), notificationData);

      console.log(`Status update notification created for order ${orderData.orderNumber}`);
    } catch (error) {
      console.error("Error creating status update notification:", error);
    }
  }

  // Create payment verification notification for customer
  private static async createPaymentVerificationNotification(
    orderData: any,
    verificationStatus: "verified" | "rejected",
    rejectionReason?: string
  ): Promise<void> {
    try {
      const isVerified = verificationStatus === "verified";

      const notificationData = {
        type: isVerified ? "payment_verified" : "payment_rejected",
        title: isVerified 
          ? "Payment Verified! ✅" 
          : "Payment Verification Failed ❌",
        message: isVerified
          ? `Your payment for order #${orderData.orderNumber} has been verified successfully. Total: ₹${orderData.total}`
          : `Your payment for order #${orderData.orderNumber} could not be verified. ${
              rejectionReason
                ? `Reason: ${rejectionReason}`
                : "Please contact support for assistance."
            }`,
        orderId: orderData.id || "",
        orderNumber: orderData.orderNumber,
        customerId: orderData.customerId,
        customerName: orderData.customerName,
        customerEmail: orderData.customerEmail,
        total: orderData.total,
        paymentMethod: orderData.paymentMethod,
        verificationStatus,
        rejectionReason: rejectionReason || null,
        targetAudience: "customer",
        isRead: false,
        priority: isVerified ? "normal" : "high",
        createdAt: new Date().toISOString(),
      };

      await addDoc(collection(db, this.notificationsCollection), notificationData);

      console.log(
        `Payment ${verificationStatus} notification created for order ${orderData.orderNumber}`
      );
    } catch (error) {
      console.error("Error creating payment verification notification:", error);
    }
  }

  // Bulk operations for multiple orders
  static async bulkUpdateOrderStatus(
    orderIds: string[],
    newStatus: Order["status"]
  ): Promise<void> {
    try {
      const batch = writeBatch(db);
      const now = new Date();
      const nowISO = now.toISOString();
      const orderDataArray: any[] = [];

      // First, get all order data
      for (const orderId of orderIds) {
        const orderDoc = await getDoc(doc(db, this.ordersCollection, orderId));
        if (orderDoc.exists()) {
          orderDataArray.push({ id: orderId, ...orderDoc.data() });
        }
      }

      // Then update all orders in batch
      for (const orderData of orderDataArray) {
        const orderRef = doc(db, this.ordersCollection, orderData.id);

        const updateData: any = {
          status: newStatus,
          updatedAt: nowISO,
        };

        const trackingField = this.getTrackingFieldForStatus(newStatus);
        if (trackingField) {
          updateData[`orderTracking.${trackingField}`] = nowISO;
        }

        // Special handling for delivered status
        if (newStatus === "delivered") {
          updateData["deliverySlot.actualDeliveryTime"] = nowISO;
          updateData["paymentStatus"] = "completed";
        }

        // Special handling for cancelled status
        if (newStatus === "cancelled") {
          updateData["isCancellable"] = false;
          updateData["isRefundable"] = true;
        }

        batch.update(orderRef, updateData);
      }

      await batch.commit();

      // Create notifications for all orders
      for (const orderData of orderDataArray) {
        await this.createStatusUpdateNotification(orderData, newStatus);
      }

      console.log(`Bulk status update completed for ${orderIds.length} orders`);
    } catch (error) {
      console.error("Error in bulk status update:", error);
      throw new Error(`Failed to bulk update order status: ${error}`);
    }
  }

  // Bulk payment verification
  static async bulkUpdatePaymentVerification(
    updates: Array<{
      orderId: string;
      verificationStatus: "verified" | "rejected";
      rejectionReason?: string;
    }>
  ): Promise<void> {
    try {
      const batch = writeBatch(db);
      const now = new Date();
      const nowISO = now.toISOString();
      const orderDataArray: any[] = [];

      // First, get all order data
      for (const update of updates) {
        const orderDoc = await getDoc(doc(db, this.ordersCollection, update.orderId));
        if (orderDoc.exists()) {
          orderDataArray.push({ 
            id: update.orderId, 
            verificationStatus: update.verificationStatus,
            rejectionReason: update.rejectionReason,
            ...orderDoc.data() 
          });
        }
      }

      // Then update all orders in batch
      for (const orderData of orderDataArray) {
        const orderRef = doc(db, this.ordersCollection, orderData.id);

        const updateData: any = {
          "paymentDetails.verificationStatus": orderData.verificationStatus,
          "paymentDetails.verificationDate": nowISO,
          updatedAt: nowISO,
        };

        // Add rejection reason only for rejected payments
        if (orderData.verificationStatus === "rejected" && orderData.rejectionReason) {
          updateData["paymentDetails.rejectionReason"] = orderData.rejectionReason;
        }

        if (orderData.verificationStatus === "verified") {
          updateData["paymentStatus"] = "completed";
        } else if (orderData.verificationStatus === "rejected") {
          updateData["paymentStatus"] = "failed";
        }

        batch.update(orderRef, updateData);
      }

      await batch.commit();

      // Create notifications for all orders
      for (const orderData of orderDataArray) {
        await this.createPaymentVerificationNotification(
          orderData,
          orderData.verificationStatus,
          orderData.rejectionReason
        );
      }

      console.log(`Bulk payment verification completed for ${updates.length} orders`);
    } catch (error) {
      console.error("Error in bulk payment verification:", error);
      throw new Error(`Failed to bulk update payment verification: ${error}`);
    }
  }

  // Get order statistics for admin dashboard
  static async getOrderStatistics(): Promise<{
    totalOrders: number;
    pendingOrders: number;
    pendingPayments: number;
    deliveredToday: number;
    todayRevenue: number;
    statusBreakdown: Record<string, number>;
    paymentBreakdown: Record<string, number>;
  }> {
    try {
      const ordersRef = collection(db, this.ordersCollection);
      const snapshot = await getDocs(ordersRef);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      let totalOrders = 0;
      let pendingOrders = 0;
      let pendingPayments = 0;
      let deliveredToday = 0;
      let todayRevenue = 0;
      const statusBreakdown: Record<string, number> = {};
      const paymentBreakdown: Record<string, number> = {};

      snapshot.forEach((doc) => {
        const data = doc.data();
        const orderDate = data.createdAt
          ? typeof data.createdAt === "string"
            ? new Date(data.createdAt)
            : data.createdAt.toDate()
          : new Date();

        totalOrders++;

        // Count status breakdown
        statusBreakdown[data.status] = (statusBreakdown[data.status] || 0) + 1;

        // Count payment method breakdown
        paymentBreakdown[data.paymentMethod] = (paymentBreakdown[data.paymentMethod] || 0) + 1;

        // Count pending orders
        if (["placed", "confirmed", "preparing", "out_for_delivery"].includes(data.status)) {
          pendingOrders++;
        }

        // Count pending payments
        if (data.paymentDetails?.verificationStatus === "pending") {
          pendingPayments++;
        }

        // Count today's delivered orders and revenue
        if (data.status === "delivered" && orderDate >= today) {
          deliveredToday++;
          todayRevenue += data.total;
        }
      });

      return {
        totalOrders,
        pendingOrders,
        pendingPayments,
        deliveredToday,
        todayRevenue,
        statusBreakdown,
        paymentBreakdown,
      };
    } catch (error) {
      console.error("Error fetching order statistics:", error);
      return {
        totalOrders: 0,
        pendingOrders: 0,
        pendingPayments: 0,
        deliveredToday: 0,
        todayRevenue: 0,
        statusBreakdown: {},
        paymentBreakdown: {},
      };
    }
  }

  // Export orders data for reporting
  static async exportOrdersData(filters?: {
    startDate?: Date;
    endDate?: Date;
    status?: string;
    paymentMethod?: string;
  }): Promise<Order[]> {
    try {
      const ordersRef = collection(db, this.ordersCollection);
      let q = query(ordersRef, orderBy("createdAt", "desc"));

      // Apply filters if provided
      if (filters?.status) {
        q = query(
          ordersRef,
          where("status", "==", filters.status),
          orderBy("createdAt", "desc")
        );
      }

      if (filters?.paymentMethod) {
        q = query(
          ordersRef,
          where("paymentMethod", "==", filters.paymentMethod),
          orderBy("createdAt", "desc")
        );
      }

      const snapshot = await getDocs(q);
      const orders: Order[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        const orderDate = data.createdAt
          ? typeof data.createdAt === "string"
            ? new Date(data.createdAt)
            : data.createdAt.toDate()
          : new Date();

        // Apply date filters
        if (filters?.startDate && orderDate < filters.startDate) return;
        if (filters?.endDate && orderDate > filters.endDate) return;

        orders.push({
          id: doc.id,
          ...data,
          createdAt: orderDate,
          updatedAt: data.updatedAt
            ? typeof data.updatedAt === "string"
              ? new Date(data.updatedAt)
              : data.updatedAt.toDate()
            : new Date(),
          estimatedDeliveryTime: data.estimatedDeliveryTime
            ? typeof data.estimatedDeliveryTime === "string"
              ? new Date(data.estimatedDeliveryTime)
              : data.estimatedDeliveryTime.toDate()
            : new Date(),
          deliverySlot: {
            ...data.deliverySlot,
            estimatedTime: data.deliverySlot.estimatedTime
              ? typeof data.deliverySlot.estimatedTime === "string"
                ? new Date(data.deliverySlot.estimatedTime)
                : data.deliverySlot.estimatedTime.toDate()
              : new Date(),
          },
        } as Order);
      });

      return orders;
    } catch (error) {
      console.error("Error exporting orders data:", error);
      return [];
    }
  }

  // Search orders by various criteria
  static async searchOrders(searchTerm: string): Promise<Order[]> {
    try {
      const ordersRef = collection(db, this.ordersCollection);
      const snapshot = await getDocs(ordersRef);
      const orders: Order[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();

        // Search in order number, customer name, phone, and email
        const searchableText = `
          ${data.orderNumber} 
          ${data.customerName} 
          ${data.customerPhone} 
          ${data.customerEmail || ""}
        `.toLowerCase();

        if (searchableText.includes(searchTerm.toLowerCase())) {
          orders.push({
            id: doc.id,
            ...data,
            createdAt: data.createdAt
              ? typeof data.createdAt === "string"
                ? new Date(data.createdAt)
                : data.createdAt.toDate()
              : new Date(),
            updatedAt: data.updatedAt
              ? typeof data.updatedAt === "string"
                ? new Date(data.updatedAt)
                : data.updatedAt.toDate()
              : new Date(),
            estimatedDeliveryTime: data.estimatedDeliveryTime
              ? typeof data.estimatedDeliveryTime === "string"
                ? new Date(data.estimatedDeliveryTime)
                : data.estimatedDeliveryTime.toDate()
              : new Date(),
          } as Order);
        }
      });

      return orders.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      );
    } catch (error) {
      console.error("Error searching orders:", error);
      return [];
    }
  }
}
