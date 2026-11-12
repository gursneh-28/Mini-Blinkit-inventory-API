
async function expireReservations(client) {
  await client.query(`
    WITH expired_reservations AS (
      UPDATE reservations
      SET status = 'EXPIRED'
      WHERE status = 'HELD'
        AND expires_at <= NOW()
      RETURNING product_id, quantity
    ),
    expired_totals AS (
      SELECT product_id, SUM(quantity)::INTEGER AS quantity
      FROM expired_reservations
      GROUP BY product_id
    )
    UPDATE products AS p
    SET reserved_qty = p.reserved_qty - expired_totals.quantity,
        updated_at = NOW()
    FROM expired_totals
    WHERE p.id = expired_totals.product_id
  `);
}

module.exports = expireReservations;
