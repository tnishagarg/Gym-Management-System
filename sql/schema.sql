-- FULL SCHEMA for Gym Management (includes admin for plain login)
CREATE DATABASE IF NOT EXISTS gymdb;
USE gymdb;

SET FOREIGN_KEY_CHECKS=0;
DROP TABLE IF EXISTS enrolls_to, workout_plan, instructs, trainer_time, trainer_mobile_no,
  mem_mobile_no, trainer_pay, trainer_payment, gym_type, gym_pay,
  member_detail, member, trainer, workout, payment, gym, admin;
SET FOREIGN_KEY_CHECKS=1;

-- Admin (plain password for demo)
CREATE TABLE admin(
  admin_id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(120) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL
);
INSERT INTO admin(name,email,password) VALUES ('Demo Admin','admin@gym.local','admin123');

-- Core tables
CREATE TABLE gym (
  gym_id INT AUTO_INCREMENT PRIMARY KEY,
  gym_name VARCHAR(100) NOT NULL,
  street_no VARCHAR(20),
  street_name VARCHAR(100),
  pin_code VARCHAR(10),
  landmark VARCHAR(100)
);

CREATE TABLE payment (
  pay_id INT AUTO_INCREMENT PRIMARY KEY,
  amount DECIMAL(10,2) DEFAULT 0
);

CREATE TABLE gym_pay (
  pay_id INT PRIMARY KEY,
  gym_id INT,
  FOREIGN KEY (pay_id) REFERENCES payment(pay_id) ON DELETE CASCADE,
  FOREIGN KEY (gym_id) REFERENCES gym(gym_id) ON DELETE SET NULL
);

CREATE TABLE gym_type (
  gym_id INT PRIMARY KEY,
  type ENUM('Men','Women','Unisex') NOT NULL,
  FOREIGN KEY (gym_id) REFERENCES gym(gym_id) ON DELETE CASCADE
);

CREATE TABLE trainer (
  trainer_id INT AUTO_INCREMENT PRIMARY KEY,
  trainer_first_name VARCHAR(50),
  trainer_last_name VARCHAR(50)
);

CREATE TABLE trainer_pay (
  trainer_id INT,
  pay_id INT,
  PRIMARY KEY (trainer_id, pay_id),
  FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id) ON DELETE CASCADE,
  FOREIGN KEY (pay_id) REFERENCES payment(pay_id) ON DELETE CASCADE
);

CREATE TABLE trainer_mobile_no (
  trainer_id INT,
  mobile_no VARCHAR(20),
  PRIMARY KEY (trainer_id, mobile_no),
  FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id) ON DELETE CASCADE
);

CREATE TABLE trainer_time (
  trainer_id INT,
  time VARCHAR(40),
  PRIMARY KEY (trainer_id, time),
  FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id) ON DELETE CASCADE
);

CREATE TABLE member (
  mem_id INT AUTO_INCREMENT PRIMARY KEY,
  mem_first_name VARCHAR(50) NOT NULL,
  mem_last_name VARCHAR(50) NOT NULL,
  dob DATE NOT NULL,
  trainer_id INT NULL,
  FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id) ON DELETE SET NULL
);
DROP FUNCTION IF EXISTS getAge;
DELIMITER $$

CREATE FUNCTION getAge(d DATE) RETURNS INT
DETERMINISTIC
BEGIN
  RETURN TIMESTAMPDIFF(YEAR, d, CURDATE());
END $$
DELIMITER ;


CREATE TABLE member_detail (
  mem_id INT PRIMARY KEY,
  age INT,
  FOREIGN KEY (mem_id) REFERENCES member(mem_id) ON DELETE CASCADE
);

CREATE TABLE mem_mobile_no (
  mem_id INT,
  mobile_no VARCHAR(20),
  PRIMARY KEY (mem_id, mobile_no),
  FOREIGN KEY (mem_id) REFERENCES member(mem_id) ON DELETE CASCADE
);

CREATE TABLE trainer_payment (
  member_id INT,
  pay_id INT,
  trainer_id INT,
  PRIMARY KEY (member_id, pay_id),
  FOREIGN KEY (member_id) REFERENCES member(mem_id) ON DELETE CASCADE,
  FOREIGN KEY (pay_id) REFERENCES payment(pay_id) ON DELETE CASCADE,
  FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id) ON DELETE SET NULL
);

CREATE TABLE workout (
  workout_id INT AUTO_INCREMENT PRIMARY KEY,
  workout_name VARCHAR(100) NOT NULL,
  description TEXT
);

CREATE TABLE workout_plan (
  workout_id INT PRIMARY KEY,
  workout_schedule VARCHAR(100),
  workout_repetition DECIMAL(4,1),
  FOREIGN KEY (workout_id) REFERENCES workout(workout_id) ON DELETE CASCADE
);

CREATE TABLE instructs (
  trainer_id INT,
  workout_id INT,
  PRIMARY KEY (trainer_id, workout_id),
  FOREIGN KEY (trainer_id) REFERENCES trainer(trainer_id) ON DELETE CASCADE,
  FOREIGN KEY (workout_id) REFERENCES workout(workout_id) ON DELETE CASCADE
);

CREATE TABLE enrolls_to (
  mem_id INT,
  workout_id INT,
  date DATE,
  PRIMARY KEY (mem_id, workout_id),
  FOREIGN KEY (mem_id) REFERENCES member(mem_id) ON DELETE CASCADE,
  FOREIGN KEY (workout_id) REFERENCES workout(workout_id) ON DELETE CASCADE
);

-- Procedure
DROP PROCEDURE IF EXISTS AssignTrainerToWorkout;
DELIMITER $$
CREATE PROCEDURE AssignTrainerToWorkout(IN p_trainer_id INT, IN p_workout_id INT)
BEGIN
  IF NOT EXISTS (SELECT 1 FROM trainer WHERE trainer_id = p_trainer_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Trainer not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM workout WHERE workout_id = p_workout_id) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Workout not found';
  END IF;
  INSERT IGNORE INTO instructs (trainer_id, workout_id) VALUES (p_trainer_id, p_workout_id);
END $$
DELIMITER ;

-- Function
DROP FUNCTION IF EXISTS TotalWorkouts;
DELIMITER $$
CREATE FUNCTION TotalWorkouts(p_mem_id INT) RETURNS INT
DETERMINISTIC
BEGIN
  DECLARE cnt INT;
  SELECT COUNT(*) INTO cnt FROM enrolls_to WHERE mem_id = p_mem_id;
  RETURN IFNULL(cnt, 0);
END $$
DELIMITER ;

-- Trigger 1: Non-negative payment
DROP TRIGGER IF EXISTS trg_payment_nonneg;
DELIMITER $$
CREATE TRIGGER trg_payment_nonneg
BEFORE INSERT ON payment
FOR EACH ROW
BEGIN
  IF NEW.amount < 0 THEN SET NEW.amount = 0; END IF;
END $$
DELIMITER ;

-- Trigger 2: Unique mobile number
DROP TRIGGER IF EXISTS trg_unique_mobile;
DELIMITER $$
CREATE TRIGGER trg_unique_mobile
BEFORE INSERT ON mem_mobile_no
FOR EACH ROW
BEGIN
  IF EXISTS (SELECT 1 FROM mem_mobile_no WHERE mobile_no = NEW.mobile_no) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Mobile number already registered';
  END IF;
END $$
DELIMITER ;

-- Seed
INSERT INTO gym (gym_name, street_no, street_name, pin_code, landmark) VALUES
('Gold Gym','86A','Vikas Enclave','180002','Nirmal Traders'),
('Fitness Gym','96B','Patel Nagar','180002',NULL);
INSERT INTO gym_type (gym_id,type) VALUES (1,'Men'),(2,'Unisex');

INSERT INTO trainer (trainer_first_name, trainer_last_name) VALUES
('Ramesh','Gupta'),('Ram','Singh');

INSERT INTO payment (amount) VALUES (5000),(4700),(5500);
INSERT INTO gym_pay (pay_id, gym_id) VALUES (1,1),(2,1),(3,2);

INSERT INTO member (mem_first_name, mem_last_name, dob, trainer_id) VALUES
('Akshay','Gupta','2001-01-09',1),
('Arjun','Sharma','2005-01-18',2);
INSERT INTO member_detail (mem_id) VALUES (1),(2);
INSERT INTO mem_mobile_no (mem_id, mobile_no) VALUES (1,'9999900001'), (2,'9999900002');

INSERT INTO trainer_payment (member_id, pay_id, trainer_id) VALUES
(1,1,1),(2,3,2);

INSERT INTO workout (workout_name, description) VALUES
('Jump Squat','Deep squat jumps'),('Push-ups','Knee friendly variation');
INSERT INTO workout_plan (workout_id, workout_schedule, workout_repetition) VALUES
(1,'3 sets of 10',2.0),(2,'2 sets of 30',0.5);

CALL AssignTrainerToWorkout(1,1);
CALL AssignTrainerToWorkout(2,2);
